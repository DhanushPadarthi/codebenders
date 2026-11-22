-- ==============================================================================
-- FeePulse Migration Proposal: Payment Reference Uniqueness & Idempotency
-- File: supabase/migrations/proposed_20261122000005_payment_idempotency_reference.sql
-- Target Staging: eyauiehyiipqkvfjecnx
-- Status: PROPOSAL ONLY — DO NOT APPLY TO DATABASE WITHOUT USER AUTHORIZATION
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
