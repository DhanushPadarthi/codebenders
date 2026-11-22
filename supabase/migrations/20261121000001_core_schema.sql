-- Migration: 20261121000001_core_schema.sql
-- Description: Hardened Core Schema for FeePulse (Problem Statement 1: Small Business Operations - The One-Person Back Office)
-- Target: Independent Home Tutors & Micro Tuition Businesses (1-5 staff, 20-80 students)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES (Linked 1:1 to Supabase Auth Users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. BUSINESSES (Multi-tenant isolation boundary - protected against client deletion)
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_businesses_id_owner UNIQUE (id, owner_id)
);

-- 3. BUSINESS_SETTINGS (Financial starting parameters and preferences)
CREATE TABLE IF NOT EXISTS public.business_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    opening_cash_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (opening_cash_balance >= 0),
    default_payment_terms_days INTEGER NOT NULL DEFAULT 7 CHECK (default_payment_terms_days >= 0),
    upi_id TEXT,
    upi_qr_code_url TEXT,
    invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
    monthly_burn_target NUMERIC(12,2) DEFAULT 0.00 CHECK (monthly_burn_target >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CUSTOMERS (Students and Parents - Protected historical record retention)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_name TEXT,
    grade_subject TEXT,
    email TEXT,
    phone TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL,
    default_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (default_fee_amount >= 0),
    billing_cycle_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_cycle_day BETWEEN 1 AND 31),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    notes TEXT,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_customers_business_id UNIQUE (business_id, id)
);

-- 5. INVOICES (Fee billing with balance calculation and soft-delete protection)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    invoice_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    balance_due NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
    notes TEXT,
    pdf_url TEXT,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Cross-tenant customer scoping
    CONSTRAINT fk_invoices_customer FOREIGN KEY (business_id, customer_id)
        REFERENCES public.customers(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT uk_invoices_business_id UNIQUE (business_id, id),
    -- Composite unique key to enforce strict customer & business consistency in dependent child tables
    CONSTRAINT uk_invoices_business_customer_id UNIQUE (business_id, customer_id, id),
    CONSTRAINT uk_business_invoice_number UNIQUE (business_id, invoice_number),
    CONSTRAINT chk_invoice_dates CHECK (due_date >= issue_date),
    CONSTRAINT chk_invoice_balance_due CHECK (balance_due >= 0),
    CONSTRAINT chk_invoice_paid_not_exceed_total CHECK (amount_paid <= total_amount)
);

-- 6. INVOICE_ITEMS (Line items per invoice with direct business scoping)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(8,2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (business_id, invoice_id)
        REFERENCES public.invoices(business_id, id) ON DELETE CASCADE
);

-- 7. PAYMENTS (Transactions against invoices - FINANCIAL HISTORY PROTECTED)
-- ON DELETE RESTRICT prevents accidental deletion of invoices with recorded payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode TEXT NOT NULL DEFAULT 'upi' CHECK (payment_mode IN ('upi', 'cash', 'bank_transfer', 'cheque', 'other')),
    reference_id TEXT,
    receipt_image_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enforce that business, customer and invoice strictly match at constraint level
    CONSTRAINT fk_payments_invoice_customer FOREIGN KEY (business_id, customer_id, invoice_id)
        REFERENCES public.invoices(business_id, customer_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_payments_customer FOREIGN KEY (business_id, customer_id)
        REFERENCES public.customers(business_id, id) ON DELETE RESTRICT
);

-- 8. BILLS (Operational expenses, recurring rent, utilities, salaries - Protected retention)
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('rent', 'electricity', 'internet', 'salary', 'materials', 'software', 'other')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_frequency TEXT CHECK (recurring_frequency IN ('monthly', 'quarterly', 'yearly') OR recurring_frequency IS NULL),
    recurring_day_of_month INTEGER CHECK (recurring_day_of_month BETWEEN 1 AND 31 OR recurring_day_of_month IS NULL),
    recurring_end_date DATE CHECK (recurring_end_date IS NULL OR recurring_end_date >= due_date),
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'overdue')),
    paid_date DATE,
    vendor_name TEXT,
    notes TEXT,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PAYMENT_PROMISES (Extracted commitments - STRICT INVOICE & CUSTOMER CONSISTENCY)
CREATE TABLE IF NOT EXISTS public.payment_promises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    invoice_id UUID,
    raw_message TEXT NOT NULL,
    promised_amount NUMERIC(12,2) NOT NULL CHECK (promised_amount >= 0),
    promised_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'broken', 'cancelled')),
    confidence_score NUMERIC(3,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_promises_customer FOREIGN KEY (business_id, customer_id)
        REFERENCES public.customers(business_id, id) ON DELETE CASCADE,
    -- Enforce that invoice matches the same business and customer; ON DELETE RESTRICT preserves financial promise auditability
    CONSTRAINT fk_promises_invoice_customer FOREIGN KEY (business_id, customer_id, invoice_id)
        REFERENCES public.invoices(business_id, customer_id, id) ON DELETE RESTRICT
);

-- 10. FOLLOW_UP_TASKS (Prioritized queue for collections)
CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    invoice_id UUID,
    priority_score NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    priority_level TEXT NOT NULL DEFAULT 'medium' CHECK (priority_level IN ('low', 'medium', 'high', 'urgent')),
    due_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
    last_reminder_tone TEXT CHECK (last_reminder_tone IN ('friendly', 'professional', 'firm', 'urgent')),
    last_reminder_text TEXT,
    last_contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tasks_customer FOREIGN KEY (business_id, customer_id)
        REFERENCES public.customers(business_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_invoice_customer FOREIGN KEY (business_id, customer_id, invoice_id)
        REFERENCES public.invoices(business_id, customer_id, id) ON DELETE CASCADE
);

-- 11. CASHFLOW_SCENARIOS (What-If simulations - disposable simulation sandbox)
CREATE TABLE IF NOT EXISTS public.cashflow_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_summary JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES for Query Performance & Multi-Tenant Lookups
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON public.businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(business_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON public.customers(business_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_business ON public.invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(business_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(business_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(business_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_business ON public.invoice_items(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_business ON public.payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(business_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_bills_business ON public.bills(business_id);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON public.bills(business_id, due_date);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(business_id, status);
CREATE INDEX IF NOT EXISTS idx_bills_deleted_at ON public.bills(business_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_promises_business ON public.payment_promises(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_promises_customer ON public.payment_promises(customer_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_business_priority ON public.follow_up_tasks(business_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_cashflow_scenarios_business ON public.cashflow_scenarios(business_id, is_active);
