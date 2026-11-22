-- Migration: 20261121000003_rls_policies.sql
-- Description: Multi-tenant Row-Level Security (RLS) policies, column-level protections, and financial retention enforcement

-- 1. Helper Security Function (SET search_path = '')
CREATE OR REPLACE FUNCTION public.is_business_owner(b_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = b_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Explicit function-level grants and revocations
REVOKE ALL ON FUNCTION public.is_business_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_owner(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invoice_effective_status(TEXT, DATE, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_effective_status(TEXT, DATE, NUMERIC, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.transition_invoice_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_invoice_status(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_invoice(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice(UUID) TO authenticated;

-- Internal trigger functions: Revoke execute from non-postgres roles
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.prevent_soft_delete_restoration() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.validate_invoice_mutation() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.check_invoice_item_mutation_allowed() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.sync_invoice_payments() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.sync_single_invoice_payment(UUID) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.sync_invoice_items_total() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.recalculate_invoice_items_total(UUID) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.validate_payment_promise_invoice() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;

-- Ensure effective invoices views enforce caller RLS (PostgreSQL 15+)
ALTER VIEW public.v_invoices_effective SET (security_invoker = true);
GRANT SELECT ON public.v_invoices_effective TO authenticated;

ALTER VIEW public.v_invoices_history SET (security_invoker = true);
GRANT SELECT ON public.v_invoices_history TO authenticated;

-- 2. Enable Row-Level Security on all 11 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_scenarios ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 3. PROFILES: User profile (PROTECTED: No DELETE policy to protect financial records)
-- ==============================================================================
REVOKE DELETE ON TABLE public.profiles FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

-- ==============================================================================
-- 4. BUSINESSES: Tenant boundary (PROTECTED: No physical DELETE policy)
-- ==============================================================================
REVOKE DELETE ON TABLE public.businesses FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.businesses TO authenticated;

DROP POLICY IF EXISTS "Owners can view own businesses" ON public.businesses;
CREATE POLICY "Owners can view own businesses"
ON public.businesses FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can create businesses" ON public.businesses;
CREATE POLICY "Owners can create businesses"
ON public.businesses FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update own businesses" ON public.businesses;
CREATE POLICY "Owners can update own businesses"
ON public.businesses FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete own businesses" ON public.businesses;

-- ==============================================================================
-- 5. BUSINESS_SETTINGS: Financial preferences (1:1 with business, no DELETE)
-- ==============================================================================
REVOKE DELETE ON TABLE public.business_settings FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_settings TO authenticated;

DROP POLICY IF EXISTS "Owners manage settings" ON public.business_settings;
DROP POLICY IF EXISTS "Owners can view settings" ON public.business_settings;
CREATE POLICY "Owners can view settings"
ON public.business_settings FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can insert settings" ON public.business_settings;
CREATE POLICY "Owners can insert settings"
ON public.business_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can update settings" ON public.business_settings;
CREATE POLICY "Owners can update settings"
ON public.business_settings FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 6. CUSTOMERS: Historical student roster (PROTECTED: No physical DELETE policy)
-- Archival and soft-delete via status='archived' or deleted_at
-- ==============================================================================
REVOKE DELETE ON TABLE public.customers FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customers TO authenticated;

DROP POLICY IF EXISTS "Owners manage customers" ON public.customers;
DROP POLICY IF EXISTS "Owners can view customers" ON public.customers;
CREATE POLICY "Owners can view customers"
ON public.customers FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can insert customers" ON public.customers;
CREATE POLICY "Owners can insert customers"
ON public.customers FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can update customers" ON public.customers;
CREATE POLICY "Owners can update customers"
ON public.customers FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 7. INVOICES: Financial records (PROTECTED: Column privileges, soft-delete RPC only)
-- ==============================================================================
REVOKE DELETE ON TABLE public.invoices FROM authenticated, anon, PUBLIC;
REVOKE UPDATE ON TABLE public.invoices FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.invoices TO authenticated;

-- Protect financial and lifecycle columns: amount_paid, total_amount, subtotal, status, deleted_at cannot be updated directly
GRANT UPDATE (
    customer_id,
    invoice_number,
    issue_date,
    due_date,
    discount,
    notes,
    pdf_url
) ON TABLE public.invoices TO authenticated;

DROP POLICY IF EXISTS "Owners manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Owners can view invoices" ON public.invoices;
CREATE POLICY "Owners can view invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can insert invoices" ON public.invoices;
CREATE POLICY "Owners can insert invoices"
ON public.invoices FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can update invoices" ON public.invoices;
CREATE POLICY "Owners can update invoices"
ON public.invoices FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 8. INVOICE_ITEMS: Line items (Mutable ONLY while invoice is in draft status)
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_items TO authenticated;

DROP POLICY IF EXISTS "Owners manage invoice items" ON public.invoice_items;
CREATE POLICY "Owners manage invoice items"
ON public.invoice_items FOR ALL
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 9. PAYMENTS: Historical money transactions (ENFORCE RPC MUTATIONS ONLY)
-- ==============================================================================
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM authenticated, anon, PUBLIC;
GRANT SELECT ON TABLE public.payments TO authenticated;

DROP POLICY IF EXISTS "Owners manage payments" ON public.payments;
DROP POLICY IF EXISTS "Owners can view own payments" ON public.payments;
CREATE POLICY "Owners can view own payments"
ON public.payments FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

-- ==============================================================================
-- 10. BILLS: Operational costs (PROTECTED: Soft-delete via deleted_at, no physical DELETE)
-- ==============================================================================
REVOKE DELETE ON TABLE public.bills FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bills TO authenticated;

DROP POLICY IF EXISTS "Owners manage bills" ON public.bills;
DROP POLICY IF EXISTS "Owners can view bills" ON public.bills;
CREATE POLICY "Owners can view bills"
ON public.bills FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can insert bills" ON public.bills;
CREATE POLICY "Owners can insert bills"
ON public.bills FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can update bills" ON public.bills;
CREATE POLICY "Owners can update bills"
ON public.bills FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 11. PAYMENT_PROMISES: Historical promises (PROTECTED: Status cancel, no physical DELETE)
-- ==============================================================================
REVOKE DELETE ON TABLE public.payment_promises FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_promises TO authenticated;

DROP POLICY IF EXISTS "Owners manage payment promises" ON public.payment_promises;
DROP POLICY IF EXISTS "Owners can view payment promises" ON public.payment_promises;
CREATE POLICY "Owners can view payment promises"
ON public.payment_promises FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can insert payment promises" ON public.payment_promises;
CREATE POLICY "Owners can insert payment promises"
ON public.payment_promises FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can update payment promises" ON public.payment_promises;
CREATE POLICY "Owners can update payment promises"
ON public.payment_promises FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 12. FOLLOW_UP_TASKS: Action log (PROTECTED: Dismiss via status, no physical DELETE)
-- ==============================================================================
REVOKE DELETE ON TABLE public.follow_up_tasks FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.follow_up_tasks TO authenticated;

DROP POLICY IF EXISTS "Owners manage follow up tasks" ON public.follow_up_tasks;
DROP POLICY IF EXISTS "Owners can view follow up tasks" ON public.follow_up_tasks;
CREATE POLICY "Owners can view follow up tasks"
ON public.follow_up_tasks FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can insert follow up tasks" ON public.follow_up_tasks;
CREATE POLICY "Owners can insert follow up tasks"
ON public.follow_up_tasks FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

DROP POLICY IF EXISTS "Owners can update follow up tasks" ON public.follow_up_tasks;
CREATE POLICY "Owners can update follow up tasks"
ON public.follow_up_tasks FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

-- ==============================================================================
-- 13. CASHFLOW_SCENARIOS: What-If simulation sandbox (Disposable records: Full CRUD allowed)
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cashflow_scenarios TO authenticated;

DROP POLICY IF EXISTS "Owners manage cashflow scenarios" ON public.cashflow_scenarios;
CREATE POLICY "Owners manage cashflow scenarios"
ON public.cashflow_scenarios FOR ALL
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));
