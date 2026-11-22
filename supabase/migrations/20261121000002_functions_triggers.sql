-- Migration: 20261121000002_functions_triggers.sql
-- Description: Hardened trigger functions, invoice items synchronization, lifecycle transitions RPC, and immutability guards

-- 1. Automatic updated_at timestamp function (SET search_path = '')
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Apply updated_at triggers to all mutable tables
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_businesses_updated_at ON public.businesses;
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_business_settings_updated_at ON public.business_settings;
CREATE TRIGGER trg_business_settings_updated_at BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_invoice_items_updated_at ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_updated_at BEFORE UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bills_updated_at ON public.bills;
CREATE TRIGGER trg_bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_promises_updated_at ON public.payment_promises;
CREATE TRIGGER trg_payment_promises_updated_at BEFORE UPDATE ON public.payment_promises FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_follow_up_tasks_updated_at ON public.follow_up_tasks;
CREATE TRIGGER trg_follow_up_tasks_updated_at BEFORE UPDATE ON public.follow_up_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cashflow_scenarios_updated_at ON public.cashflow_scenarios;
CREATE TRIGGER trg_cashflow_scenarios_updated_at BEFORE UPDATE ON public.cashflow_scenarios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Soft-Delete Restoration Prevention Trigger for Customers and Bills
CREATE OR REPLACE FUNCTION public.prevent_soft_delete_restoration()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Restoring deleted records is not permitted through direct update.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_customers_prevent_restore ON public.customers;
CREATE TRIGGER trg_customers_prevent_restore
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.prevent_soft_delete_restoration();

DROP TRIGGER IF EXISTS trg_bills_prevent_restore ON public.bills;
CREATE TRIGGER trg_bills_prevent_restore
BEFORE UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.prevent_soft_delete_restoration();

-- 3. Validate Invoice Mutation & Financial Immutability (SET search_path = '')
CREATE OR REPLACE FUNCTION public.validate_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
    -- Business ID cannot be altered
    IF OLD.business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION 'business_id is immutable.';
    END IF;

    -- Soft-delete restoration protection: once deleted, cannot be un-deleted
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Restoring deleted invoices by clearing deleted_at is not permitted.';
    END IF;

    -- If invoice is soft-deleted, reject all field modifications
    IF OLD.deleted_at IS NOT NULL AND (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.* IS DISTINCT FROM NEW.*) THEN
        RAISE EXCEPTION 'Invoice % is soft-deleted and cannot be modified.', OLD.id;
    END IF;

    -- Customer reassignment only allowed on draft invoices
    IF OLD.customer_id IS DISTINCT FROM NEW.customer_id AND OLD.status != 'draft' THEN
        RAISE EXCEPTION 'Cannot change customer on finalized invoice % (current status: %).', OLD.id, OLD.status;
    END IF;

    -- Identity and date immutability: invoice_number, issue_date, and due_date only editable while status is draft
    IF OLD.status != 'draft' AND OLD.invoice_number IS DISTINCT FROM NEW.invoice_number THEN
        RAISE EXCEPTION 'Cannot modify invoice_number on finalized invoice % (current status: %).', OLD.id, OLD.status;
    END IF;

    IF OLD.status != 'draft' AND OLD.issue_date IS DISTINCT FROM NEW.issue_date THEN
        RAISE EXCEPTION 'Cannot modify issue_date on finalized invoice % (current status: %).', OLD.id, OLD.status;
    END IF;

    IF OLD.status != 'draft' AND OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        RAISE EXCEPTION 'Cannot modify due_date on finalized invoice % (current status: %).', OLD.id, OLD.status;
    END IF;

    -- Financial immutability: discount can only be changed on draft invoices
    IF OLD.status != 'draft' AND OLD.discount IS DISTINCT FROM NEW.discount THEN
        RAISE EXCEPTION 'Cannot modify discount on invoice %: Invoice is % (only draft invoices can be edited).',
            OLD.id, OLD.status;
    END IF;

    -- If discount changed on draft invoice, recalculate total_amount
    IF OLD.status = 'draft' AND OLD.discount IS DISTINCT FROM NEW.discount THEN
        NEW.total_amount := pg_catalog.greatest(0.00, NEW.subtotal - pg_catalog.coalesce(NEW.discount, 0.00));
    END IF;

    -- Prevent total_amount from dropping below recorded payments
    IF NEW.total_amount < OLD.amount_paid THEN
        RAISE EXCEPTION 'Total amount (₹%) cannot be lower than payments already received (₹%).',
            NEW.total_amount, OLD.amount_paid;
    END IF;

    -- Prevent cancelling invoices with recorded payments
    IF NEW.status = 'cancelled' AND OLD.amount_paid > 0 THEN
        RAISE EXCEPTION 'Cannot cancel invoice %: Payments totaling ₹% have already been recorded.',
            OLD.id, OLD.amount_paid;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_invoice_mutation ON public.invoices;
CREATE TRIGGER trg_validate_invoice_mutation
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_mutation();

-- 4. Line Items Immutability Guard: Only Draft Invoices Allow Item Changes (SET search_path = '')
CREATE OR REPLACE FUNCTION public.check_invoice_item_mutation_allowed()
RETURNS TRIGGER AS $$
DECLARE
    target_invoice_id UUID;
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_invoice_id := OLD.invoice_id;
    ELSE
        target_invoice_id := NEW.invoice_id;
    END IF;

    SELECT status, deleted_at INTO v_status, v_deleted_at
    FROM public.invoices
    WHERE id = target_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % does not exist.', target_invoice_id;
    END IF;

    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify line items on invoice %: Invoice is soft-deleted or cancelled.', target_invoice_id;
    END IF;

    IF v_status != 'draft' THEN
        RAISE EXCEPTION 'Financial immutability violation: Invoice % is in % status. Line items can only be modified while the invoice is in draft status.',
            target_invoice_id, v_status;
    END IF;

    -- If moving a line item between invoices, also verify OLD invoice is draft
    IF (TG_OP = 'UPDATE') AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
        SELECT status, deleted_at INTO v_status, v_deleted_at
        FROM public.invoices WHERE id = OLD.invoice_id;

        IF v_status != 'draft' OR v_deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot move line item from finalized or soft-deleted invoice %.', OLD.invoice_id;
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_invoice_items_immutability ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.check_invoice_item_mutation_allowed();

-- 5. Automatic Line Items Subtotal & Total Amount Synchronization (SET search_path = '')
CREATE OR REPLACE FUNCTION public.recalculate_invoice_items_total(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_subtotal NUMERIC(12,2);
    v_discount NUMERIC(12,2);
    v_total_amount NUMERIC(12,2);
BEGIN
    -- Lock target invoice for update to prevent concurrent race conditions
    SELECT discount INTO v_discount
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF FOUND THEN
        -- Compute cumulative sum of active line items
        SELECT pg_catalog.coalesce(pg_catalog.sum(total_price), 0.00)
        INTO v_subtotal
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id;

        v_total_amount := pg_catalog.greatest(0.00, v_subtotal - pg_catalog.coalesce(v_discount, 0.00));

        UPDATE public.invoices
        SET subtotal = v_subtotal,
            total_amount = v_total_amount,
            updated_at = pg_catalog.now()
        WHERE id = p_invoice_id;

        -- Re-synchronize payment status in case total_amount changed
        PERFORM public.sync_single_invoice_payment(p_invoice_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.sync_invoice_items_total()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM public.recalculate_invoice_items_total(OLD.invoice_id);
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
            PERFORM public.recalculate_invoice_items_total(OLD.invoice_id);
        END IF;
        PERFORM public.recalculate_invoice_items_total(NEW.invoice_id);
    ELSE
        PERFORM public.recalculate_invoice_items_total(NEW.invoice_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_invoice_items_sync ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_sync
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_items_total();

-- 6. Concurrency-Safe Invoice Payment Synchronization Function (SET search_path = '')
CREATE OR REPLACE FUNCTION public.sync_single_invoice_payment(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_paid NUMERIC(12,2);
    v_total_amount NUMERIC(12,2);
    v_due_date DATE;
    v_current_status TEXT;
    v_new_status TEXT;
BEGIN
    -- Explicit row lock on invoice to prevent concurrent overwrite / race conditions
    SELECT total_amount, due_date, status
    INTO v_total_amount, v_due_date, v_current_status
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Compute cumulative verified payments
    SELECT pg_catalog.coalesce(pg_catalog.sum(amount), 0.00)
    INTO v_total_paid
    FROM public.payments
    WHERE invoice_id = p_invoice_id;

    -- Strict financial validation: Reject payment states that exceed total amount
    IF v_total_paid > v_total_amount THEN
        RAISE EXCEPTION 'Total payments (₹%) exceed invoice total amount (₹%) for invoice %',
            v_total_paid, v_total_amount, p_invoice_id;
    END IF;

    -- Determine new status
    IF v_current_status = 'cancelled' THEN
        v_new_status := 'cancelled';
    ELSIF v_total_paid >= v_total_amount THEN
        v_new_status := 'paid';
    ELSIF v_total_paid > 0.00 THEN
        IF v_due_date < pg_catalog.current_date AND v_current_status != 'draft' THEN
            v_new_status := 'overdue'; -- Partially paid but past due date
        ELSE
            v_new_status := 'partially_paid';
        END IF;
    ELSE
        IF v_due_date < pg_catalog.current_date AND v_current_status != 'draft' THEN
            v_new_status := 'overdue';
        ELSIF v_current_status = 'draft' THEN
            v_new_status := 'draft';
        ELSE
            v_new_status := 'sent';
        END IF;
    END IF;

    -- Synchronize invoice totals
    UPDATE public.invoices
    SET amount_paid = v_total_paid,
        status = v_new_status,
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Trigger handler dispatching sync_single_invoice_payment (SET search_path = '')
CREATE OR REPLACE FUNCTION public.sync_invoice_payments()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM public.sync_single_invoice_payment(OLD.invoice_id);
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
            PERFORM public.sync_single_invoice_payment(OLD.invoice_id);
        END IF;
        PERFORM public.sync_single_invoice_payment(NEW.invoice_id);
    ELSE
        PERFORM public.sync_single_invoice_payment(NEW.invoice_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_payments_sync_invoice ON public.payments;
CREATE TRIGGER trg_payments_sync_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_payments();

-- 7. Validate Payment Promise Invoice Ownership (SET search_path = '')
CREATE OR REPLACE FUNCTION public.validate_payment_promise_invoice()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.invoices inv
            WHERE inv.id = NEW.invoice_id 
              AND inv.business_id = NEW.business_id 
              AND inv.customer_id = NEW.customer_id
        ) THEN
            RAISE EXCEPTION 'Invoice % does not belong to business % and customer %',
                NEW.invoice_id, NEW.business_id, NEW.customer_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_payment_promise_invoice ON public.payment_promises;
CREATE TRIGGER trg_validate_payment_promise_invoice
BEFORE INSERT OR UPDATE ON public.payment_promises
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_promise_invoice();

-- 8. Dynamic Real-Time Effective Status Evaluation (Never stale, SET search_path = '')
CREATE OR REPLACE FUNCTION public.get_invoice_effective_status(
    p_status TEXT,
    p_due_date DATE,
    p_amount_paid NUMERIC,
    p_total_amount NUMERIC
)
RETURNS TEXT AS $$
BEGIN
    IF p_status = 'cancelled' THEN
        RETURN 'cancelled';
    ELSIF p_amount_paid >= p_total_amount THEN
        RETURN 'paid';
    ELSIF p_status = 'draft' THEN
        RETURN 'draft';
    ELSIF pg_catalog.current_date > p_due_date THEN
        RETURN 'overdue';
    ELSIF p_amount_paid > 0 THEN
        RETURN 'partially_paid';
    ELSE
        RETURN 'sent';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

-- View presenting real-time dynamic active invoices with exact ageing boundaries (1-7, 8-15, 16-30, 31+)
CREATE OR REPLACE VIEW public.v_invoices_effective AS
SELECT 
    inv.*,
    public.get_invoice_effective_status(inv.status, inv.due_date, inv.amount_paid, inv.total_amount) AS effective_status,
    pg_catalog.greatest(0, (pg_catalog.current_date - inv.due_date)) AS overdue_days,
    CASE 
        WHEN pg_catalog.current_date <= inv.due_date THEN 'current'
        WHEN (pg_catalog.current_date - inv.due_date) BETWEEN 1 AND 7 THEN '1-7_days'
        WHEN (pg_catalog.current_date - inv.due_date) BETWEEN 8 AND 15 THEN '8-15_days'
        WHEN (pg_catalog.current_date - inv.due_date) BETWEEN 16 AND 30 THEN '16-30_days'
        ELSE '31+_days'
    END AS ageing_bucket
FROM public.invoices inv
WHERE inv.deleted_at IS NULL;

-- View presenting complete invoice history including cancelled and soft-deleted invoices for auditability
CREATE OR REPLACE VIEW public.v_invoices_history AS
SELECT 
    inv.*,
    public.get_invoice_effective_status(inv.status, inv.due_date, inv.amount_paid, inv.total_amount) AS effective_status,
    pg_catalog.greatest(0, (pg_catalog.current_date - inv.due_date)) AS overdue_days,
    CASE 
        WHEN pg_catalog.current_date <= inv.due_date THEN 'current'
        WHEN (pg_catalog.current_date - inv.due_date) BETWEEN 1 AND 7 THEN '1-7_days'
        WHEN (pg_catalog.current_date - inv.due_date) BETWEEN 8 AND 15 THEN '8-15_days'
        WHEN (pg_catalog.current_date - inv.due_date) BETWEEN 16 AND 30 THEN '16-30_days'
        ELSE '31+_days'
    END AS ageing_bucket,
    (inv.deleted_at IS NOT NULL OR inv.status = 'cancelled') AS is_archived_or_cancelled
FROM public.invoices inv;

-- 9. Transactional Atomic Payment Registration RPC (SET search_path = '')
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

-- 10. Controlled Invoice Lifecycle Transitions RPC (SET search_path = '')
CREATE OR REPLACE FUNCTION public.transition_invoice_status(
    p_invoice_id UUID,
    p_new_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_business_id UUID;
    v_current_status TEXT;
    v_amount_paid NUMERIC(12,2);
    v_deleted_at TIMESTAMPTZ;
    v_due_date DATE;
    v_resulting_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT business_id, status, amount_paid, deleted_at, due_date
    INTO v_business_id, v_current_status, v_amount_paid, v_deleted_at, v_due_date
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % not found.', p_invoice_id;
    END IF;

    IF NOT public.is_business_owner(v_business_id) THEN
        RAISE EXCEPTION 'Access denied: caller does not own the business for invoice %.', p_invoice_id;
    END IF;

    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot transition status: Invoice % is soft-deleted.', p_invoice_id;
    END IF;

    -- Enforce state machine transitions
    IF p_new_status = 'sent' THEN
        IF v_current_status != 'draft' THEN
            RAISE EXCEPTION 'Only draft invoices can be transitioned to sent (current status: %).', v_current_status;
        END IF;

        IF v_due_date < pg_catalog.current_date THEN
            v_resulting_status := 'overdue';
        ELSE
            v_resulting_status := 'sent';
        END IF;

    ELSIF p_new_status = 'cancelled' THEN
        IF v_amount_paid > 0 THEN
            RAISE EXCEPTION 'Cannot cancel invoice %: Payments totaling ₹% exist. Refund or void payments first.',
                p_invoice_id, v_amount_paid;
        END IF;

        IF v_current_status IN ('paid', 'partially_paid') THEN
            RAISE EXCEPTION 'Cannot cancel % invoice %.', v_current_status, p_invoice_id;
        END IF;

        v_resulting_status := 'cancelled';

    ELSE
        RAISE EXCEPTION 'Invalid target status "%". Payment-driven statuses (partially_paid, paid, overdue) are managed automatically by payments.',
            p_new_status;
    END IF;

    UPDATE public.invoices
    SET status = v_resulting_status,
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'previous_status', v_current_status,
        'status', v_resulting_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 11. Controlled Invoice Soft-Delete RPC (SET search_path = '')
-- Prevents paid or partially paid invoices from being hidden from accounting records
CREATE OR REPLACE FUNCTION public.soft_delete_invoice(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_business_id UUID;
    v_amount_paid NUMERIC(12,2);
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT business_id, amount_paid, status, deleted_at
    INTO v_business_id, v_amount_paid, v_status, v_deleted_at
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % not found.', p_invoice_id;
    END IF;

    IF NOT public.is_business_owner(v_business_id) THEN
        RAISE EXCEPTION 'Access denied: caller does not own the business for invoice %.', p_invoice_id;
    END IF;

    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Invoice % is already soft-deleted.', p_invoice_id;
    END IF;

    -- Prevent hiding paid or partially paid invoices from financial history
    IF v_amount_paid > 0 OR v_status IN ('paid', 'partially_paid') THEN
        RAISE EXCEPTION 'Cannot delete or hide invoice %: Payments totaling ₹% have already been recorded. Paid and partially paid invoices must remain in financial history.',
            p_invoice_id, v_amount_paid;
    END IF;

    UPDATE public.invoices
    SET deleted_at = pg_catalog.now(),
        status = 'cancelled',
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'deleted_at', pg_catalog.now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 12. Automatic User Profile & Business Provisioning on Signup (SET search_path = '')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_business_id UUID;
    user_name TEXT;
BEGIN
    user_name := pg_catalog.coalesce(NEW.raw_user_meta_data->>'full_name', pg_catalog.split_part(NEW.email, '@', 1), 'Tutor');

    -- Insert Profile
    INSERT INTO public.profiles (id, full_name, email, avatar_url)
    VALUES (
        NEW.id,
        user_name,
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = pg_catalog.now();

    -- Create Default Business
    INSERT INTO public.businesses (owner_id, name, currency, timezone)
    VALUES (
        NEW.id,
        user_name || '''s Tuition Classes',
        'INR',
        'Asia/Kolkata'
    )
    RETURNING id INTO new_business_id;

    -- Create Default Business Settings
    INSERT INTO public.business_settings (business_id, opening_cash_balance, default_payment_terms_days, invoice_prefix)
    VALUES (
        new_business_id,
        0.00,
        7,
        'INV-'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Trigger attached to auth.users (runs on new user signup)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
