-- ============================================================================
-- Migration: Corrective 20261122000008 - Harden refund_ai_quota
-- Status: PROPOSED ONLY (DO NOT APPLY REMOTELY WITHOUT EXPLICIT AUTHORIZATION)
-- Description:
--   Replaces public.refund_ai_quota from 20261122000007 to:
--   (a) reject NULL request-log IDs from non-service callers,
--   (b) reject p_credits <= 0,
--   (c) keep the consumed-request, same-business and already-refunded checks,
--   (d) keep the refund capped at the logged credits_used,
--   (e) keep a service_role-only manual refund path.
-- Target: PostgreSQL 17 / Supabase
-- ============================================================================

-- 7. Atomic Quota Refund Function (for failed AI requests) - hardened
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

  -- 0b. Credits must be a positive integer (checked before any row lock)
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Refund credits must be a positive integer.',
      'code', 'INVALID_CREDITS'
    );
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
    -- Unlinked refunds are only permitted for service_role (manual/admin path)
    IF v_caller_role IS DISTINCT FROM 'service_role' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'A request log ID is required for refunds.',
        'code', 'REQUEST_ID_REQUIRED'
      );
    END IF;

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

    -- Mark original request log as refunded or adjust partially refunded credits
    IF p_request_log_id IS NOT NULL THEN
      IF v_actual_refund >= v_log.credits_used THEN
        UPDATE public.ai_request_logs
        SET status = 'refunded',
            credits_used = 0
        WHERE id = p_request_log_id;
      ELSE
        UPDATE public.ai_request_logs
        SET credits_used = credits_used - v_actual_refund
        WHERE id = p_request_log_id;
      END IF;
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

-- 8. Privilege Hygiene: no PUBLIC/anon execution; only authenticated and service_role
REVOKE ALL ON FUNCTION public.refund_ai_quota(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, UUID, UUID, INTEGER) TO authenticated, service_role;
