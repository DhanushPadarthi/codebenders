-- ==============================================================================
-- FeePulse Migration: Payment Reference Uniqueness & Idempotency
-- File: supabase/migrations/20261122000010_payment_idempotency_reference.sql
-- Target Staging: eyauiehyiipqkvfjecnx
-- Status: PROPOSED FORWARD MIGRATION — DO NOT APPLY REMOTELY WITHOUT USER AUTHORIZATION
-- ==============================================================================
--
-- AUDIT RATIONALE & PROBLEM STATEMENT:
-- Currently, `public.payments` allows multiple payments within the same business
-- to share the same `reference_id` (such as a 12-digit UPI UTR number or bank cheque number).
--
-- While `public.record_invoice_payment()` performs row-level locking (`FOR UPDATE`)
-- on the parent invoice to prevent race conditions and overpayment, duplicate external
-- reference IDs (e.g. from network retries, browser re-submits, or fraudulent re-use of an
-- existing UPI confirmation screenshot) are not rejected at the database level.
--
-- PROPOSED SOLUTION:
-- Create a partial unique index on `(business_id, reference_id)` on `public.payments`.
-- This guarantees that within a single business, no two payments can record the exact
-- same external reference ID.
--
-- Note that Cash payments frequently lack a banking reference (or have null/empty/dash values).
-- By defining a partial index that filters out null, empty, and dash strings, Cash payments
-- remain unconstrained while digital transactions (UPI, NEFT, RTGS, IMPS, Cheques)
-- gain strict database-enforced idempotency.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_business_reference
ON public.payments (business_id, reference_id)
WHERE reference_id IS NOT NULL
  AND trim(reference_id) != ''
  AND trim(reference_id) != '—'
  AND trim(reference_id) != '-';

COMMENT ON INDEX uq_payments_business_reference IS
'Enforces idempotency and prevents duplicate payments using identical UPI UTR or Cheque numbers within a tenant.';

-- Update record_invoice_payment to explicitly check reference_id inside invoice FOR UPDATE transaction
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
    p_invoice_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_mode TEXT DEFAULT 'upi',
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_reference_id TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_receipt_image_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_business_id UUID;
    v_customer_id UUID;
    v_total_amount NUMERIC(12,2);
    v_amount_paid NUMERIC(12,2);
    v_balance_due NUMERIC(12,2);
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
    v_payment_id UUID;
    v_updated_invoice RECORD;
BEGIN
    -- Strict authentication check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Validate payment amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;

    -- Query and lock active invoice row
    SELECT business_id, customer_id, total_amount, amount_paid, (total_amount - amount_paid), status, deleted_at
    INTO v_business_id, v_customer_id, v_total_amount, v_amount_paid, v_balance_due, v_status, v_deleted_at
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice with ID % not found.', p_invoice_id;
    END IF;

    -- Ensure cancelled or soft-deleted invoices cannot receive payments
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot record payment: Invoice % has been soft-deleted.', p_invoice_id;
    END IF;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot record payment: Invoice % has been cancelled.', p_invoice_id;
    END IF;

    -- Multi-tenant authorization check
    IF NOT public.is_business_owner(v_business_id) THEN
        RAISE EXCEPTION 'Access denied: caller does not own the business for invoice %', p_invoice_id;
    END IF;

    -- Prevent overpayments
    IF p_amount > v_balance_due THEN
        RAISE EXCEPTION 'Payment amount (₹%) exceeds remaining balance due (₹%).', p_amount, v_balance_due;
    END IF;

    -- Enforce idempotency: Reject duplicate reference_id or idempotency key within this business
    IF p_reference_id IS NOT NULL AND TRIM(p_reference_id) != '' AND TRIM(p_reference_id) NOT IN ('—', '-') THEN
        IF EXISTS (
            SELECT 1 FROM public.payments
            WHERE business_id = v_business_id
              AND reference_id = TRIM(p_reference_id)
        ) THEN
            RAISE EXCEPTION 'Duplicate payment rejected: A payment with reference ID or idempotency key "%" has already been recorded.', TRIM(p_reference_id);
        END IF;
    END IF;

    -- Insert payment transaction (executed under SECURITY DEFINER privileges)
    INSERT INTO public.payments (
        business_id,
        invoice_id,
        customer_id,
        amount,
        payment_date,
        payment_mode,
        reference_id,
        receipt_image_url,
        notes
    ) VALUES (
        v_business_id,
        p_invoice_id,
        v_customer_id,
        p_amount,
        p_payment_date,
        p_payment_mode,
        p_reference_id,
        p_receipt_image_url,
        p_notes
    )
    RETURNING id INTO v_payment_id;

    -- Fetch updated invoice data (synced by trigger)
    SELECT * INTO v_updated_invoice FROM public.invoices WHERE id = p_invoice_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'invoice_id', p_invoice_id,
        'amount_paid', v_updated_invoice.amount_paid,
        'balance_due', v_updated_invoice.balance_due,
        'status', v_updated_invoice.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
