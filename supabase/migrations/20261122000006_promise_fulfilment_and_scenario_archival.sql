-- ==============================================================================
-- PROPOSED MIGRATION (FORWARD-ONLY, NOT APPLIED TO STAGING):
-- proposed_20261122000006_promise_fulfilment_and_scenario_archival.sql
--
-- TARGET: PostgreSQL 17 / Supabase
-- PURPOSE:
-- 1. Database-Level Enforcement of Cashflow Scenario Soft-Archival:
--    - Revokes physical DELETE on public.cashflow_scenarios from authenticated, anon, PUBLIC.
--    - Replaces ALL policy with explicit SELECT, INSERT, UPDATE policies to prevent direct PostgREST deletion.
-- 2. Database-Level Enforcement of Payment Promise Fulfilment & Immutability:
--    - Enforces created_at database-clock control on INSERT (ignores/overrides client-supplied forged timestamp).
--    - Enforces strict created_at, business_id, and customer_id immutability on UPDATE.
--    - Enforces that 'fulfilled' is a TERMINAL financial state: once fulfilled, status cannot be downgraded
--      to pending, broken, cancelled, or any other state.
--    - Enforces invoice_id and promised_amount immutability on already fulfilled promises.
--    - Prevents multi-step bypass attempts (downgrading status to alter financial identity/amount).
--    - Enforces that promises cannot transition to 'fulfilled' unless verified payments recorded
--      through the application exist on or after the promise's original immutable created_at date.
--    - Eliminates any backward grace window to prevent counting prior payments.
--    - Preserves legitimate transitions from pending to 'broken', 'cancelled', and 'fulfilled'.
-- 3. Trigger Security & Privilege Hygiene:
--    - Function defined as SECURITY DEFINER with SET search_path = ''.
--    - Revokes direct EXECUTE on trigger function from PUBLIC, authenticated, anon.
-- ==============================================================================

-- ==============================================================================
-- PART 1: CASHFLOW SCENARIOS PHYSICAL DELETE REVOCATION
-- ==============================================================================

-- Revoke DELETE privilege from authenticated, anon, PUBLIC
REVOKE DELETE ON TABLE public.cashflow_scenarios FROM authenticated, anon, PUBLIC;

-- Drop existing ALL policy to eliminate any permissive delete capability
DROP POLICY IF EXISTS "Owners manage cashflow scenarios" ON public.cashflow_scenarios;
DROP POLICY IF EXISTS "Owners can view cashflow scenarios" ON public.cashflow_scenarios;
DROP POLICY IF EXISTS "Owners can insert cashflow scenarios" ON public.cashflow_scenarios;
DROP POLICY IF EXISTS "Owners can update cashflow scenarios" ON public.cashflow_scenarios;

-- Explicit RLS policies for SELECT, INSERT, UPDATE only (omitting DELETE entirely)
CREATE POLICY "Owners can view cashflow scenarios"
ON public.cashflow_scenarios FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

CREATE POLICY "Owners can insert cashflow scenarios"
ON public.cashflow_scenarios FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Owners can update cashflow scenarios"
ON public.cashflow_scenarios FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- PART 2: PAYMENT PROMISE FULFILMENT & IMMUTABILITY TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validate_payment_promise_fulfilment()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid NUMERIC(12,2);
    v_balance_due NUMERIC(12,2);
    v_invoice_business_id UUID;
    v_invoice_customer_id UUID;
    v_must_validate_fulfilment BOOLEAN := FALSE;
    v_payment_ref_timestamp TIMESTAMPTZ;
BEGIN
    -- Explicit TG_OP branching: NEVER reference OLD during INSERT operations
    IF TG_OP = 'INSERT' THEN
        -- Rule 1: created_at must be controlled strictly by PostgreSQL database clock
        NEW.created_at := pg_catalog.clock_timestamp();

        -- On INSERT: if status is fulfilled, trigger verification against payments recorded on/after creation
        IF NEW.status = 'fulfilled' THEN
            v_must_validate_fulfilment := TRUE;
            v_payment_ref_timestamp := NEW.created_at;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Rule 2: Immutable created_at timestamp (enforced across all statuses, including pending)
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Cannot modify created_at on a payment promise.';
        END IF;

        -- Rule 3: Immutable business tenancy (tenant ownership cannot be reassigned)
        IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
            RAISE EXCEPTION 'Cannot modify business_id on a payment promise.';
        END IF;

        -- Rule 4: Immutable customer identity (promise cannot be transferred to another student)
        IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
            RAISE EXCEPTION 'Cannot modify customer_id on a payment promise.';
        END IF;

        -- Rule 5: Terminal state and immutability of already fulfilled promises
        IF OLD.status = 'fulfilled' THEN
            -- Fulfilled is a terminal financial state: prevent downgrade to pending, broken, cancelled, etc.
            IF NEW.status IS DISTINCT FROM 'fulfilled' THEN
                RAISE EXCEPTION 'Cannot change status on an already fulfilled payment promise. Fulfilled is a terminal state.';
            END IF;
            IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
                RAISE EXCEPTION 'Cannot change invoice_id on an already fulfilled payment promise.';
            END IF;
            IF NEW.promised_amount IS DISTINCT FROM OLD.promised_amount THEN
                RAISE EXCEPTION 'Cannot change promised_amount on an already fulfilled payment promise.';
            END IF;
        END IF;

        -- Rule 6: Transitioning from non-fulfilled to fulfilled
        IF NEW.status = 'fulfilled' AND OLD.status IS DISTINCT FROM 'fulfilled' THEN
            v_must_validate_fulfilment := TRUE;
            -- Use the promise's original immutable creation timestamp (no backward grace window)
            v_payment_ref_timestamp := OLD.created_at;
        END IF;
    END IF;

    -- Execute fulfilment verification if triggered
    IF v_must_validate_fulfilment THEN
        IF NEW.invoice_id IS NULL THEN
            RAISE EXCEPTION 'Cannot mark unlinked promise as fulfilled: promise must be linked to a specific invoice with verified payments recorded through the application.';
        END IF;

        -- Query invoice balance and verify customer & business ownership
        SELECT business_id, customer_id, balance_due
        INTO v_invoice_business_id, v_invoice_customer_id, v_balance_due
        FROM public.invoices
        WHERE id = NEW.invoice_id AND business_id = NEW.business_id AND customer_id = NEW.customer_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice % does not exist or does not belong to business % and customer %.',
                NEW.invoice_id, NEW.business_id, NEW.customer_id;
        END IF;

        -- Sum eligible payments recorded through the application since the promise was created
        SELECT COALESCE(SUM(amount), 0.00)
        INTO v_total_paid
        FROM public.payments
        WHERE invoice_id = NEW.invoice_id
          AND business_id = NEW.business_id
          AND created_at >= v_payment_ref_timestamp;

        -- Fulfilment verification condition:
        -- Must have at least one payment recorded through the application since promise creation AND either:
        -- (total_paid >= promised_amount) OR (balance_due <= 0.00)
        IF v_total_paid <= 0.00 THEN
            RAISE EXCEPTION 'Cannot mark promise as fulfilled: No payment recorded through the application exists for invoice % on or after the promise creation date (%).',
                NEW.invoice_id, v_payment_ref_timestamp;
        END IF;

        IF v_total_paid < NEW.promised_amount AND v_balance_due > 0.00 THEN
            RAISE EXCEPTION 'Cannot mark promise as fulfilled: Payments recorded since promise creation (₹%) are less than promised amount (₹%) and remaining invoice balance is ₹%.',
                v_total_paid, NEW.promised_amount, v_balance_due;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke direct execution privileges on the trigger function
REVOKE EXECUTE ON FUNCTION public.validate_payment_promise_fulfilment() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_validate_payment_promise_fulfilment ON public.payment_promises;
CREATE TRIGGER trg_validate_payment_promise_fulfilment
BEFORE INSERT OR UPDATE ON public.payment_promises
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_promise_fulfilment();
