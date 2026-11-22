-- ============================================================================
-- Migration: Proposed 20261122000007 - AI Usage Quotas and Distributed Rate Limiting
-- Status: PROPOSED ONLY (DO NOT APPLY REMOTELY WITHOUT EXPLICIT AUTHORIZATION)
-- Description:
--   Establishes persistent multi-tenant AI usage quotas, monthly credit limits,
--   sliding-window distributed rate limiting, and audit logging to replace in-memory
--   rate limiting in production environments.
-- Target: PostgreSQL 17 / Supabase
-- ============================================================================

-- 1. AI Usage Quotas Table
CREATE TABLE IF NOT EXISTS public.ai_usage_quotas (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  monthly_quota_credits INTEGER NOT NULL DEFAULT 100 CHECK (monthly_quota_credits >= 0),
  used_credits INTEGER NOT NULL DEFAULT 0 CHECK (used_credits >= 0),
  billing_month VARCHAR(7) NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. AI Request Audit Log Table
CREATE TABLE IF NOT EXISTS public.ai_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 1 CHECK (credits_used >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'rate_limited', 'quota_exceeded', 'error', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 3. Indexes for fast quota lookup and audit reporting
CREATE INDEX IF NOT EXISTS idx_ai_quotas_business_month ON public.ai_usage_quotas(business_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_ai_logs_business_created ON public.ai_request_logs(business_id, created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE public.ai_usage_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_request_logs ENABLE ROW LEVEL SECURITY;

-- 5. Multi-Tenant RLS Policies: Businesses can read their own quota and logs
DROP POLICY IF EXISTS ai_quotas_select_own ON public.ai_usage_quotas;
CREATE POLICY ai_quotas_select_own ON public.ai_usage_quotas
  FOR SELECT
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_logs_select_own ON public.ai_request_logs;
CREATE POLICY ai_logs_select_own ON public.ai_request_logs
  FOR SELECT
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- 6. Atomic Quota Consumption, Distributed Rate Limiting & Monthly Reset Function
-- Ordering guarantee:
-- 1. Safely ensure business quota row exists.
-- 2. Acquire its row lock with SELECT ... FOR UPDATE.
-- 3. Check the sliding-window request count.
-- 4. Check monthly quota.
-- 5. Atomically consume credit and record the request.
-- All operations execute in the same PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_business_id UUID,
  p_user_id UUID,
  p_endpoint VARCHAR(100),
  p_model VARCHAR(100),
  p_credits INTEGER DEFAULT 1,
  p_max_requests_per_minute INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_uid UUID;
  v_current_month VARCHAR(7);
  v_quota RECORD;
  v_new_used INTEGER;
  v_recent_requests INTEGER;
  v_request_log_id UUID;
BEGIN
  -- 0. Caller & Tenant Authorization Check
  v_caller_role := auth.role();
  v_caller_uid := auth.uid();

  IF v_caller_role IS DISTINCT FROM 'service_role' THEN
    IF v_caller_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller is not authenticated.';
    END IF;

    -- Caller cannot forge user_id
    IF p_user_id IS DISTINCT FROM v_caller_uid THEN
      RAISE EXCEPTION 'Forbidden: Provided user ID (%) does not match authenticated caller (%).',
        p_user_id, v_caller_uid;
    END IF;

    -- Caller must own the business
    IF NOT EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = p_business_id AND owner_id = v_caller_uid
    ) THEN
      RAISE EXCEPTION 'Forbidden: Authenticated user does not own business %.', p_business_id;
    END IF;
  END IF;

  v_current_month := to_char(pg_catalog.clock_timestamp(), 'YYYY-MM');

  -- 1. Safely ensure the business quota row exists
  INSERT INTO public.ai_usage_quotas (business_id, monthly_quota_credits, used_credits, billing_month, last_request_at)
  VALUES (p_business_id, 100, 0, v_current_month, pg_catalog.clock_timestamp())
  ON CONFLICT (business_id) DO NOTHING;

  -- 2. Acquire its row lock with SELECT ... FOR UPDATE (serializes all concurrent calls for this business)
  SELECT * INTO v_quota
  FROM public.ai_usage_quotas
  WHERE business_id = p_business_id
  FOR UPDATE;

  -- 3. Check the sliding-window request count inside the locked transaction
  SELECT count(*) INTO v_recent_requests
  FROM public.ai_request_logs
  WHERE business_id = p_business_id
    AND created_at >= (pg_catalog.clock_timestamp() - INTERVAL '1 minute');

  IF v_recent_requests >= p_max_requests_per_minute THEN
    -- Log rate-limited event
    INSERT INTO public.ai_request_logs (id, business_id, user_id, endpoint, model, credits_used, status, created_at)
    VALUES (pg_catalog.gen_random_uuid(), p_business_id, p_user_id, p_endpoint, p_model, 0, 'rate_limited', pg_catalog.clock_timestamp());

    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'Rate limit exceeded',
      'message', 'Too many requests. Please retry in 60 seconds.',
      'code', 'RATE_LIMIT_EXCEEDED',
      'retry_after_seconds', 60
    );
  END IF;

  -- 4. Check monthly quota limit & perform calendar month rollover
  IF v_quota.billing_month IS DISTINCT FROM v_current_month THEN
    UPDATE public.ai_usage_quotas
    SET used_credits = 0,
        billing_month = v_current_month,
        updated_at = pg_catalog.clock_timestamp()
    WHERE business_id = p_business_id;

    v_quota.used_credits := 0;
    v_quota.billing_month := v_current_month;
  END IF;

  IF (v_quota.used_credits + p_credits) > v_quota.monthly_quota_credits THEN
    -- Log quota exceeded event
    INSERT INTO public.ai_request_logs (id, business_id, user_id, endpoint, model, credits_used, status, created_at)
    VALUES (pg_catalog.gen_random_uuid(), p_business_id, p_user_id, p_endpoint, p_model, 0, 'quota_exceeded', pg_catalog.clock_timestamp());

    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'Monthly quota exceeded',
      'message', 'Monthly AI request quota (100 requests) has been reached for your business.',
      'code', 'QUOTA_EXCEEDED',
      'used', v_quota.used_credits,
      'quota', v_quota.monthly_quota_credits,
      'remaining', 0
    );
  END IF;

  -- 5. Atomically consume credit and record the request
  v_new_used := v_quota.used_credits + p_credits;
  v_request_log_id := pg_catalog.gen_random_uuid();

  UPDATE public.ai_usage_quotas
  SET used_credits = v_new_used,
      last_request_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE business_id = p_business_id;

  INSERT INTO public.ai_request_logs (id, business_id, user_id, endpoint, model, credits_used, status, created_at)
  VALUES (v_request_log_id, p_business_id, p_user_id, p_endpoint, p_model, p_credits, 'success', pg_catalog.clock_timestamp());

  RETURN jsonb_build_object(
    'allowed', true,
    'request_log_id', v_request_log_id,
    'used', v_new_used,
    'quota', v_quota.monthly_quota_credits,
    'remaining', v_quota.monthly_quota_credits - v_new_used
  );
END;
$$;

-- 7. Atomic Quota Refund Function (for failed AI requests)
-- Idempotent refund linked to original request log ID
CREATE OR REPLACE FUNCTION public.refund_ai_quota(
  p_business_id UUID,
  p_user_id UUID,
  p_request_log_id UUID DEFAULT NULL,
  p_credits INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_uid UUID;
  v_log RECORD;
  v_quota RECORD;
  v_actual_refund INTEGER;
  v_new_used INTEGER;
BEGIN
  -- 0. Caller & Tenant Authorization Check
  v_caller_role := auth.role();
  v_caller_uid := auth.uid();

  IF v_caller_role IS DISTINCT FROM 'service_role' THEN
    IF v_caller_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller is not authenticated.';
    END IF;

    IF p_user_id IS DISTINCT FROM v_caller_uid THEN
      RAISE EXCEPTION 'Forbidden: Provided user ID (%) does not match authenticated caller (%).',
        p_user_id, v_caller_uid;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = p_business_id AND owner_id = v_caller_uid
    ) THEN
      RAISE EXCEPTION 'Forbidden: Authenticated user does not own business %.', p_business_id;
    END IF;
  END IF;

  -- 1. If request log ID is provided, lock and verify original request log
  IF p_request_log_id IS NOT NULL THEN
    SELECT * INTO v_log
    FROM public.ai_request_logs
    WHERE id = p_request_log_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Request log not found for this business.',
        'code', 'REQUEST_NOT_FOUND'
      );
    END IF;

    -- Idempotency check: Cannot refund multiple times
    IF v_log.status = 'refunded' THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_refunded', true,
        'message', 'Request has already been refunded.',
        'code', 'ALREADY_REFUNDED'
      );
    END IF;

    IF v_log.status IS DISTINCT FROM 'success' OR v_log.credits_used <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot refund a request that did not consume credits.',
        'code', 'INVALID_REFUND_TARGET'
      );
    END IF;

    v_actual_refund := LEAST(v_log.credits_used, p_credits);
  ELSE
    v_actual_refund := p_credits;
  END IF;

  -- 2. Lock quota row and restore credits
  SELECT * INTO v_quota
  FROM public.ai_usage_quotas
  WHERE business_id = p_business_id
  FOR UPDATE;

  IF FOUND THEN
    v_new_used := GREATEST(0, v_quota.used_credits - v_actual_refund);

    UPDATE public.ai_usage_quotas
    SET used_credits = v_new_used,
        updated_at = pg_catalog.clock_timestamp()
    WHERE business_id = p_business_id;

    -- Mark original request log as refunded
    IF p_request_log_id IS NOT NULL THEN
      UPDATE public.ai_request_logs
      SET status = 'refunded'
      WHERE id = p_request_log_id;
    ELSE
      INSERT INTO public.ai_request_logs (id, business_id, user_id, endpoint, model, credits_used, status, created_at)
      VALUES (pg_catalog.gen_random_uuid(), p_business_id, p_user_id, 'manual_refund', 'system', 0, 'refunded', pg_catalog.clock_timestamp());
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'refunded_credits', v_actual_refund,
      'used', v_new_used,
      'remaining', v_quota.monthly_quota_credits - v_new_used
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Quota row not found');
END;
$$;

-- 8. Privilege Hygiene: Revoke public execution, grant only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_ai_quota(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, UUID, UUID, INTEGER) TO service_role;
