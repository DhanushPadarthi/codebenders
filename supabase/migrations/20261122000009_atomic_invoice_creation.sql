-- Forward-Only Migration: 20261122000009_atomic_invoice_creation.sql
-- Description: Transactional RPC for atomic invoice creation with line items
-- Status: PROPOSED FORWARD MIGRATION (Requires explicit user review and approval before remote apply)
-- Target Project: FeePulse Staging (eyauiehyiipqkvfjecnx)

-- Function: public.create_invoice_with_items
-- Executes invoice header creation and bulk line item insertion within a single atomic ACID transaction.
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
    p_customer_id UUID,
    p_invoice_number TEXT,
    p_issue_date DATE,
    p_due_date DATE,
    p_discount NUMERIC(12,2) DEFAULT 0.00,
    p_notes TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_status TEXT DEFAULT 'draft'
)
RETURNS JSONB AS $$
DECLARE
    v_business_id UUID;
    v_invoice_id UUID;
    v_subtotal NUMERIC(12,2) := 0.00;
    v_total_amount NUMERIC(12,2) := 0.00;
    v_item JSONB;
    v_item_desc TEXT;
    v_item_qty NUMERIC(8,2);
    v_item_price NUMERIC(12,2);
    v_item_total NUMERIC(12,2);
BEGIN
    -- 1. Security Check: Authenticated user only
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- 2. Derive business from authenticated user
    SELECT id INTO v_business_id
    FROM public.businesses
    WHERE owner_id = auth.uid()
    LIMIT 1;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'No business found for authenticated user.';
    END IF;

    -- 3. Verify customer exists and belongs to this business
    IF NOT EXISTS (
        SELECT 1 FROM public.customers
        WHERE id = p_customer_id AND business_id = v_business_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Customer % not found or does not belong to business %.', p_customer_id, v_business_id;
    END IF;

    -- 4. Validate dates
    IF p_due_date < p_issue_date THEN
        RAISE EXCEPTION 'Due date (%) must be on or after issue date (%).', p_due_date, p_issue_date;
    END IF;

    -- 5. Validate discount
    IF p_discount < 0 THEN
        RAISE EXCEPTION 'Discount cannot be negative.';
    END IF;

    -- 6. Validate items non-empty
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Invoice must contain at least one line item.';
    END IF;

    -- 6b. Validate initial status
    IF p_status NOT IN ('draft', 'sent') THEN
        RAISE EXCEPTION 'Initial invoice status must be draft or sent (received: %).', p_status;
    END IF;

    -- 7. Insert draft invoice header (must be draft so line items immutability trigger permits item inserts)
    INSERT INTO public.invoices (
        business_id,
        customer_id,
        invoice_number,
        issue_date,
        due_date,
        subtotal,
        discount,
        total_amount,
        status,
        notes
    ) VALUES (
        v_business_id,
        p_customer_id,
        p_invoice_number,
        p_issue_date,
        p_due_date,
        0.00,
        p_discount,
        0.00,
        'draft',
        p_notes
    )
    RETURNING id INTO v_invoice_id;

    -- 8. Loop through line items and insert
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_desc := v_item->>'description';
        v_item_qty := (v_item->>'quantity')::NUMERIC(8,2);
        v_item_price := (v_item->>'unit_price')::NUMERIC(12,2);
        v_item_total := ROUND(v_item_qty * v_item_price, 2);

        IF v_item_desc IS NULL OR TRIM(v_item_desc) = '' THEN
            RAISE EXCEPTION 'Item description is required.';
        END IF;

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'Item quantity must be greater than zero.';
        END IF;

        IF v_item_price < 0 THEN
            RAISE EXCEPTION 'Item unit price cannot be negative.';
        END IF;

        INSERT INTO public.invoice_items (
            business_id,
            invoice_id,
            description,
            quantity,
            unit_price,
            total_price
        ) VALUES (
            v_business_id,
            v_invoice_id,
            v_item_desc,
            v_item_qty,
            v_item_price,
            v_item_total
        );
    END LOOP;

    -- Trigger trg_invoice_items_sync automatically calls recalculate_invoice_items_total()
    -- 9. If final requested status is 'sent', transition atomically within this transaction
    IF p_status = 'sent' THEN
        UPDATE public.invoices
        SET status = 'sent'
        WHERE id = v_invoice_id;
    END IF;

    -- Read back finalized totals
    SELECT subtotal, total_amount INTO v_subtotal, v_total_amount
    FROM public.invoices
    WHERE id = v_invoice_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', p_invoice_number,
        'subtotal', v_subtotal,
        'discount', p_discount,
        'total_amount', v_total_amount,
        'status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.create_invoice_with_items(UUID, TEXT, DATE, DATE, NUMERIC, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(UUID, TEXT, DATE, DATE, NUMERIC, TEXT, JSONB, TEXT) TO authenticated;
