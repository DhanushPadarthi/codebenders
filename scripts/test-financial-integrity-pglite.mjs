/**
 * FeePulse Financial Integrity Regression Test in Isolated PGlite (PostgreSQL 17)
 * Tests:
 * 1. Transactional atomic invoice creation via create_invoice_with_items
 * 2. Atomic rollback: When line item validation fails, 0 invoice headers remain
 * 3. Payment row locking & duplicate reference rejection in record_invoice_payment
 * 4. Missing reference ID protection: Cash payment with idempotency key rejects replay
 * 5. Database unique index uq_payments_business_reference enforcement (code 23505)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve PGlite from local temp cache
let PGlite;
try {
  const pgliteEntry = path.join(process.env.TEMP || os.tmpdir(), 'pglite-test', 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js');
  const pgliteModule = await import(pathToFileURL(pgliteEntry).href);
  PGlite = pgliteModule.PGlite;
} catch (err) {
  console.error('Failed to import PGlite:', err.message);
  process.exit(1);
}

async function run() {
  console.log('================================================================');
  console.log('FeePulse Isolated PostgreSQL 17 Financial Integrity Regression');
  console.log('================================================================\n');

  const db = new PGlite();
  await db.waitReady;

  // 1. Setup Supabase auth mock
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    DO $$ BEGIN
      CREATE ROLE authenticated;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE anon;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE service_role;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY,
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated');
    $$ LANGUAGE sql STABLE;
  `);

  // 2. Load Core Schemas & Functions
  const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
  let m1 = fs.readFileSync(path.join(migrationDir, '20261121000001_core_schema.sql'), 'utf8');
  // In native PostgreSQL 17 / PGlite, gen_random_uuid() is built-in and pgcrypto is not an external bundle
  m1 = m1.replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', '-- pgcrypto built into PG17');
  let m2 = fs.readFileSync(path.join(migrationDir, '20261121000002_functions_triggers.sql'), 'utf8');
  m2 = m2.replace(/pg_catalog\.current_date/g, 'CURRENT_DATE');
  m2 = m2.replace(/pg_catalog\.greatest/g, 'GREATEST');
  m2 = m2.replace(/pg_catalog\.coalesce/g, 'COALESCE');
  const m3 = fs.readFileSync(path.join(migrationDir, '20261121000003_rls_policies.sql'), 'utf8');
  const m4 = fs.readFileSync(path.join(migrationDir, '20261122000009_atomic_invoice_creation.sql'), 'utf8');
  const m5 = fs.readFileSync(path.join(migrationDir, '20261122000010_payment_idempotency_reference.sql'), 'utf8');

  await db.exec(m1);
  await db.exec(m2);
  await db.exec(m3);
  await db.exec(m4);
  await db.exec(m5);

  console.log('✓ Successfully bootstrapped PostgreSQL 17 schemas, triggers & RPCs.');

  // 3. Seed business & customer via handle_new_user trigger
  const userId = '11111111-1111-1111-1111-111111111111';
  const customerId = '33333333-3333-3333-3333-333333333333';

  await db.query(`
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES ($1, 'tutor@sharmaacademy.com', '{"full_name": "Sharma Sir"}'::jsonb);
  `, [userId]);

  // Read business created by handle_new_user trigger
  const bizRow = await db.query(`SELECT id FROM public.businesses WHERE owner_id = $1;`, [userId]);
  const bizId = bizRow.rows[0].id;

  await db.query(`
    INSERT INTO public.customers (id, business_id, name, grade_subject, phone, whatsapp_number)
    VALUES ($1, $2, 'Aarav Patel', 'Class 10 Math', '9876543210', '9876543210');
  `, [customerId, bizId]);

  // Set auth context to userId
  await db.exec(`SET request.jwt.claim.sub = '${userId}';`);

  const results = [];
  function record(caseNum, name, pass, detail = '') {
    results.push({ caseNum, name, pass });
    console.log(`  ${pass ? 'PASS' : 'FAIL'} [Case ${caseNum}] ${name}${detail ? ' — ' + detail : ''}`);
  }

  // Test 1: Atomic invoice creation via create_invoice_with_items
  {
    const items = JSON.stringify([
      { description: 'Physics Tuition', quantity: 1, unit_price: 2500 },
      { description: 'Math Coaching', quantity: 2, unit_price: 1500 },
    ]);

    const res = await db.query(`
      SELECT public.create_invoice_with_items(
        $1, 'INV-2026-ATOMIC-1', '2026-11-22', '2026-11-29', 0, 'Test notes', $2::jsonb, 'sent'
      ) as result;
    `, [customerId, items]);

    const out = res.rows[0].result;
    const invRows = await db.query(`SELECT * FROM public.invoices WHERE id = $1;`, [out.invoice_id]);
    const itemRows = await db.query(`SELECT * FROM public.invoice_items WHERE invoice_id = $1;`, [out.invoice_id]);

    const pass = out.success === true && invRows.rows.length === 1 && itemRows.rows.length === 2 && invRows.rows[0].status === 'sent' && Number(invRows.rows[0].total_amount) === 5500;
    record(1, 'create_invoice_with_items creates header and line items atomically in one transaction', pass,
      `invoiceId=${out.invoice_id} status=${invRows.rows[0]?.status} total=${invRows.rows[0]?.total_amount} items=${itemRows.rows.length}`);
  }

  // Test 2: Atomic rollback when line item insertion fails
  {
    const badItems = JSON.stringify([
      { description: 'Valid Item', quantity: 1, unit_price: 1000 },
      { description: 'Invalid Item', quantity: -5, unit_price: 1000 }, // Negative quantity!
    ]);

    let threwError = false;
    try {
      await db.query(`
        SELECT public.create_invoice_with_items(
          $1, 'INV-2026-FAIL-2', '2026-11-22', '2026-11-29', 0, 'Should rollback', $2::jsonb, 'draft'
        );
      `, [customerId, badItems]);
    } catch (err) {
      threwError = err.message.includes('Item quantity must be greater than zero');
    }

    const checkHeader = await db.query(`SELECT * FROM public.invoices WHERE invoice_number = 'INV-2026-FAIL-2';`);
    const checkItems = await db.query(`SELECT * FROM public.invoice_items WHERE description = 'Valid Item';`);

    const pass = threwError && checkHeader.rows.length === 0 && checkItems.rows.length === 0;
    record(2, 'Atomic rollback ensures zero partial invoice headers or items remain on failure', pass,
      `threwError=${threwError} headersFound=${checkHeader.rows.length} itemsFound=${checkItems.rows.length}`);
  }

  // Test 3: Payment row lock and duplicate reference rejection
  {
    // Create an invoice with ₹10,000 balance
    const items = JSON.stringify([{ description: 'Term 1 Fees', quantity: 1, unit_price: 10000 }]);
    const invRes = await db.query(`
      SELECT public.create_invoice_with_items(
        $1, 'INV-2026-PAY-1', '2026-11-22', '2026-11-30', 0, '', $2::jsonb, 'sent'
      ) as result;
    `, [customerId, items]);
    const invId = invRes.rows[0].result.invoice_id;

    // Payment 1 with reference 'UPI-UTR-999888'
    const pay1 = await db.query(`
      SELECT public.record_invoice_payment($1, 4000, 'upi', '2026-11-22', 'UPI-UTR-999888') as result;
    `, [invId]);

    // Payment 2 (duplicate submission with SAME reference)
    let duplicateRejected = false;
    try {
      await db.query(`
        SELECT public.record_invoice_payment($1, 4000, 'upi', '2026-11-22', 'UPI-UTR-999888') as result;
      `, [invId]);
    } catch (err) {
      duplicateRejected = err.message.includes('Duplicate payment rejected');
    }

    // Verify balance due was deducted ONLY once
    const invCheck = await db.query(`SELECT balance_due, amount_paid FROM public.invoices WHERE id = $1;`, [invId]);
    const payRows = await db.query(`SELECT * FROM public.payments WHERE reference_id = 'UPI-UTR-999888';`);

    const pass = pay1.rows[0].result.success === true && duplicateRejected && Number(invCheck.rows[0].balance_due) === 6000 && payRows.rows.length === 1;
    record(3, 'record_invoice_payment rejects duplicate payment with identical reference ID under row lock', pass,
      `pay1Success=${pay1.rows[0].result.success} rejected=${duplicateRejected} paymentsCount=${payRows.rows.length} balanceDue=${invCheck.rows[0].balance_due}`);
  }

  // Test 4: Missing reference ID with idempotency key (Cash payment replay protection)
  {
    // Create invoice
    const items = JSON.stringify([{ description: 'Chemistry Crash Course', quantity: 1, unit_price: 5000 }]);
    const invRes = await db.query(`
      SELECT public.create_invoice_with_items(
        $1, 'INV-2026-CASH-1', '2026-11-22', '2026-11-30', 0, '', $2::jsonb, 'sent'
      ) as result;
    `, [customerId, items]);
    const invId = invRes.rows[0].result.invoice_id;

    const cashIdempKey = 'IDEMP-CASH-UUID-12345';

    // Cash payment 1 with idempotency key
    const pay1 = await db.query(`
      SELECT public.record_invoice_payment($1, 2500, 'cash', '2026-11-22', $2) as result;
    `, [invId, cashIdempKey]);

    // Cash payment replay with SAME idempotency key
    let cashReplayRejected = false;
    try {
      await db.query(`
        SELECT public.record_invoice_payment($1, 2500, 'cash', '2026-11-22', $2) as result;
      `, [invId, cashIdempKey]);
    } catch (err) {
      cashReplayRejected = err.message.includes('Duplicate payment rejected');
    }

    const payRows = await db.query(`SELECT * FROM public.payments WHERE reference_id = $1;`, [cashIdempKey]);
    const pass = pay1.rows[0].result.success === true && cashReplayRejected && payRows.rows.length === 1;
    record(4, 'Cash payments bound to idempotency key are protected against duplicate replay', pass,
      `firstSuccess=${pay1.rows[0].result.success} replayRejected=${cashReplayRejected} rowsCount=${payRows.rows.length}`);
  }

  // Test 5: Database partial unique index uq_payments_business_reference enforcement
  {
    let uniqueIndexTripped = false;
    try {
      // Direct raw INSERT bypassing RPC to test database constraint layer
      await db.query(`
        INSERT INTO public.payments (business_id, invoice_id, customer_id, amount, payment_mode, reference_id)
        VALUES ($1, (SELECT id FROM public.invoices LIMIT 1), $2, 500, 'upi', 'UPI-UTR-999888');
      `, [bizId, customerId]);
    } catch (err) {
      // PostgreSQL unique violation error code 23505
      uniqueIndexTripped = err.message.includes('uq_payments_business_reference') || err.message.includes('unique constraint');
    }

    record(5, 'Partial unique index uq_payments_business_reference prevents duplicates at table constraint layer', uniqueIndexTripped,
      `constraintEnforced=${uniqueIndexTripped}`);
  }

  // Test 6: Database unique constraint uk_business_invoice_number enforcement
  {
    let duplicateInvoiceNumberRejected = false;
    let failureError = '';
    try {
      const items = JSON.stringify([{ description: 'Physics Crash Course', quantity: 1, unit_price: 3000 }]);
      // Attempt to create another invoice with the ALREADY USED invoice number 'INV-2026-ATOMIC-1' for this business
      await db.query(`
        SELECT public.create_invoice_with_items(
          $1, 'INV-2026-ATOMIC-1', '2026-11-22', '2026-11-30', 0, '', $2::jsonb, 'sent'
        ) as result;
      `, [customerId, items]);
    } catch (err) {
      failureError = err.message;
      duplicateInvoiceNumberRejected =
        err.message.includes('uk_business_invoice_number') ||
        err.message.includes('unique constraint') ||
        err.message.includes('duplicate key');
    }

    record(6, 'Database unique constraint uk_business_invoice_number strictly prevents duplicate invoice numbers per business', duplicateInvoiceNumberRejected,
      `constraintEnforced=${duplicateInvoiceNumberRejected} err="${failureError.slice(0, 45)}"`);
  }

  console.log('\n================================================================');
  const passed = results.filter((r) => r.pass).length;
  console.log(`Summary: ${passed}/${results.length} PASSED`);
  console.log('================================================================');

  if (passed !== results.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in PGlite regression test:', err);
  process.exit(1);
});
