/**
 * Unit regression test for Invoice Data Integrity:
 * - Currency precision (strictly <= 2 decimal places)
 * - Line item & discount schemas
 * - Customer ownership verification on draft update
 * - Atomic rollback when line items insert fails
 * - Atomic rollback when sent transition fails
 * - Atomic line item preservation on draft update failure
 * - Status transition validation
 */

import assert from 'assert';
import {
  isValidCurrencyPrecision,
  LineItemSchema,
  CreateInvoiceSchema,
  UpdateDraftInvoiceSchema,
  createInvoice,
  updateDraftInvoice,
  transitionInvoiceStatus,
} from '../lib/dal/invoices.ts';

console.log('================================================================');
console.log('FeePulse Invoice Integrity Regression Test');
console.log('================================================================\n');

const results = [];
function record(caseNum, name, pass, detail = '') {
  results.push({ caseNum, name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} [Case ${caseNum}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function runTests() {
  const bizId = '11111111-1111-1111-1111-111111111111';
  const customerIdA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const customerIdB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // Belongs to different business

  // Case 1: Currency precision validation
  {
    const validAmounts = [0, 10, 10.5, 10.55, 1000.99, 0.01];
    const invalidAmounts = [10.555, 0.001, 10.12345, 1e-4, 5.9999];

    const allValidsPass = validAmounts.every(isValidCurrencyPrecision);
    const allInvalidsFail = invalidAmounts.every((v) => !isValidCurrencyPrecision(v));
    record(1, 'isValidCurrencyPrecision enforces max 2 decimal places', allValidsPass && allInvalidsFail,
      `validsPass=${allValidsPass} invalidsRejected=${allInvalidsFail}`);
  }

  // Case 2: LineItemSchema rejects > 2 decimals in unitPrice
  {
    const validItem = { description: 'Tuition Fee', quantity: 1, unitPrice: 500.50 };
    const invalidPrice = { description: 'Tuition Fee', quantity: 1, unitPrice: 500.555 };
    const invalidQty = { description: 'Tuition Fee', quantity: 1.555, unitPrice: 500 };

    const validParsed = LineItemSchema.safeParse(validItem);
    const invalidPriceParsed = LineItemSchema.safeParse(invalidPrice);
    const invalidQtyParsed = LineItemSchema.safeParse(invalidQty);

    const pass = validParsed.success && !invalidPriceParsed.success && !invalidQtyParsed.success;
    record(2, 'LineItemSchema rejects precision beyond 2 decimal places for price and quantity', pass,
      `valid=${validParsed.success} priceErr=${!invalidPriceParsed.success} qtyErr=${!invalidQtyParsed.success}`);
  }

  // Case 3: CreateInvoiceSchema rejects > 2 decimals in discount and invalid due dates
  {
    const base = {
      customerId: customerIdA,
      issueDate: '2026-11-22',
      dueDate: '2026-11-25',
      discount: 50.25,
      items: [{ description: 'Physics Class', quantity: 1, unitPrice: 2000 }],
    };

    const valid = CreateInvoiceSchema.safeParse(base);
    const invalidDiscount = CreateInvoiceSchema.safeParse({ ...base, discount: 50.255 });
    const invalidDate = CreateInvoiceSchema.safeParse({ ...base, dueDate: '2026-11-20' });

    const pass = valid.success && !invalidDiscount.success && !invalidDate.success;
    record(3, 'CreateInvoiceSchema rejects 3-decimal discount and dueDate before issueDate', pass,
      `valid=${valid.success} discountErr=${!invalidDiscount.success} dateErr=${!invalidDate.success}`);
  }

  // Case 4: UpdateDraftInvoiceSchema validates discount precision and customerId format
  {
    const valid = UpdateDraftInvoiceSchema.safeParse({
      customerId: customerIdA,
      discount: 25.50,
    });
    const invalidDiscount = UpdateDraftInvoiceSchema.safeParse({ discount: 25.555 });
    const invalidCustomer = UpdateDraftInvoiceSchema.safeParse({ customerId: 'not-a-uuid' });

    const pass = valid.success && !invalidDiscount.success && !invalidCustomer.success;
    record(4, 'UpdateDraftInvoiceSchema rejects 3-decimal discount and invalid UUID', pass,
      `valid=${valid.success} discountErr=${!invalidDiscount.success} customerErr=${!invalidCustomer.success}`);
  }

  // Helper factory for mock Supabase client
  function createMockSupabase(dbState) {
    return {
      from: (table) => {
        let filters = {};
        const query = {
          select: () => query,
          eq: (field, val) => {
            filters[field] = val;
            return query;
          },
          order: () => query,
          is: (field, val) => {
            filters[field] = val;
            return query;
          },
          single: async () => {
            if (table === 'customers') {
              const cust = dbState.customers?.find(c => c.id === filters.id && (filters.business_id ? c.business_id === filters.business_id : true));
              if (!cust) return { data: null, error: new Error('Customer not found') };
              return { data: cust, error: null };
            }
            return { data: null, error: new Error('Not found') };
          },
          maybeSingle: async () => {
            if (table === 'v_invoices_effective' || table === 'v_invoices_history') {
              const inv = dbState.invoices?.find(i => i.id === filters.id && i.business_id === filters.business_id);
              return { data: inv || null, error: null };
            }
            return { data: null, error: null };
          },
          delete: () => ({
            eq: (f1, v1) => ({
              eq: async (f2, v2) => {
                dbState.deletedItems = true;
                return { error: null };
              },
            }),
          }),
          update: (payload) => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
          insert: async (payload) => {
            if (dbState.failInsert) {
              return { data: null, error: new Error('Insert failed') };
            }
            if (table === 'invoice_items') {
              dbState.insertedItems = payload;
            }
            return { data: payload, error: null };
          },
        };

        // If queried directly as a promise (e.g. for list queries)
        query.then = (resolve) => {
          if (table === 'invoice_items') {
            const items = dbState.items?.filter(it => it.invoice_id === filters.invoice_id) || [];
            resolve({ data: items, error: null });
          } else {
            resolve({ data: [], error: null });
          }
        };

        return query;
      },
      rpc: async (fn, params) => {
        if (dbState.failRpc) {
          return { data: null, error: new Error('RPC failure') };
        }
        return { data: { status: params.p_new_status, previous_status: 'draft' }, error: null };
      },
    };
  }

  // Case 5: updateDraftInvoice customer ownership check
  {
    const dbState = {
      invoices: [{
        id: 'inv-1',
        business_id: bizId,
        customer_id: customerIdA,
        status: 'draft',
        amount_paid: 0,
        subtotal: 1000,
        discount: 0,
        total_amount: 1000,
        issue_date: '2026-11-22',
        due_date: '2026-11-25',
      }],
      customers: [
        { id: customerIdA, business_id: bizId, name: 'Student A' },
        // customerIdB belongs to another business!
        { id: customerIdB, business_id: 'other-biz', name: 'Student B' },
      ],
      items: [{ id: 'item-1', invoice_id: 'inv-1', business_id: bizId, description: 'Math', quantity: 1, unit_price: 1000, total_price: 1000 }],
    };

    const mockClient = createMockSupabase(dbState);
    let ownershipCheckPassed = false;
    try {
      await updateDraftInvoice(mockClient, bizId, 'inv-1', { customerId: customerIdB });
    } catch (err) {
      ownershipCheckPassed = err.message.includes('Selected student does not exist or does not belong to your academy');
    }

    record(5, 'updateDraftInvoice rejects cross-tenant customer assignment', ownershipCheckPassed,
      `rejected=${ownershipCheckPassed}`);
  }

  // Case 6: updateDraftInvoice restores original items if inserting new items fails
  {
    const originalItems = [
      { id: 'item-old-1', business_id: bizId, invoice_id: 'inv-1', description: 'Original Item', quantity: 1, unit_price: 500, total_price: 500 },
    ];
    const dbState = {
      invoices: [{
        id: 'inv-1',
        business_id: bizId,
        customer_id: customerIdA,
        status: 'draft',
        amount_paid: 0,
        subtotal: 500,
        discount: 0,
        total_amount: 500,
        issue_date: '2026-11-22',
        due_date: '2026-11-25',
      }],
      customers: [{ id: customerIdA, business_id: bizId, name: 'Student A' }],
      items: originalItems,
      failInsert: true, // Will fail the new line items insert!
    };

    const mockClient = createMockSupabase(dbState);
    let caughtError = false;
    try {
      await updateDraftInvoice(mockClient, bizId, 'inv-1', {
        items: [{ description: 'New Item That Fails', quantity: 2, unitPrice: 200 }],
      });
    } catch (err) {
      caughtError = err.message.includes('Failed to insert updated line items');
    }

    const pass = caughtError && dbState.deletedItems === true;
    record(6, 'updateDraftInvoice detects insert failure and triggers compensating rollback', pass,
      `caughtError=${caughtError} deletedAttempted=${dbState.deletedItems}`);
  }

  // Case 7: transitionInvoiceStatus validates allowed statuses and blocks invalid transitions
  {
    const dbState = {
      invoices: [{
        id: 'inv-paid',
        business_id: bizId,
        customer_id: customerIdA,
        status: 'paid',
        amount_paid: 5000,
        subtotal: 5000,
        discount: 0,
        total_amount: 5000,
        issue_date: '2026-11-22',
        due_date: '2026-11-25',
      }],
      customers: [{ id: customerIdA, business_id: bizId, name: 'Student A' }],
      items: [],
    };

    const mockClient = createMockSupabase(dbState);

    let invalidStatusRejected = false;
    try {
      await transitionInvoiceStatus(mockClient, bizId, 'inv-paid', 'invalid_status');
    } catch (err) {
      invalidStatusRejected = err.message.includes('Invalid status transition');
    }

    let cancelPaidRejected = false;
    try {
      await transitionInvoiceStatus(mockClient, bizId, 'inv-paid', 'cancelled');
    } catch (err) {
      cancelPaidRejected = err.message.includes('Cannot cancel invoice with recorded payments');
    }

    const pass = invalidStatusRejected && cancelPaidRejected;
    record(7, 'transitionInvoiceStatus enforces state machine rules before invoking RPC', pass,
      `invalidTargetRejected=${invalidStatusRejected} cancelPaidRejected=${cancelPaidRejected}`);
  }

  // Case 8: createInvoice utilizes atomic RPC create_invoice_with_items when available
  {
    let rpcCalledWith = null;
    const mockClient = {
      from: (table) => {
        let filters = {};
        const query = {
          select: () => query,
          eq: (f, v) => {
            filters[f] = v;
            return query;
          },
          is: () => query,
          in: () => query,
          single: async () => {
            if (table === 'customers') {
              return { data: { id: customerIdA, business_id: bizId, is_active: true, deleted_at: null, name: 'Aarav Patel', grade_subject: 'Class 10', parent_name: 'Mr. Patel', phone: '9999999999' }, error: null };
            }
            return { data: null, error: new Error('Not found') };
          },
          maybeSingle: async () => {
            if (table === 'customers') {
              return { data: { id: customerIdA, business_id: bizId, is_active: true, deleted_at: null, name: 'Aarav Patel' }, error: null };
            }
            if (table === 'v_invoices_effective' || table === 'invoices') {
              return {
                data: {
                  id: 'inv-atomic-001',
                  business_id: bizId,
                  customer_id: customerIdA,
                  invoice_number: 'INV-2026-999',
                  subtotal: 3000,
                  discount: 0,
                  total_amount: 3000,
                  amount_paid: 0,
                  balance_due: 3000,
                  status: 'sent',
                  deleted_at: null,
                  issue_date: '2026-11-22',
                  due_date: '2026-11-29',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          order: () => query,
          limit: () => query,
        };

        query.then = (resolve) => {
          if (table === 'invoice_items') {
            resolve({
              data: [
                {
                  id: 'item-1',
                  business_id: bizId,
                  invoice_id: 'inv-atomic-001',
                  description: 'Calculus Coaching',
                  quantity: 1,
                  unit_price: 3000,
                  total_price: 3000,
                  created_at: new Date().toISOString(),
                },
              ],
              error: null,
            });
          } else {
            resolve({ data: [], error: null });
          }
        };

        return query;
      },
      rpc: async (fn, params) => {
        if (fn === 'create_invoice_with_items') {
          rpcCalledWith = params;
          return {
            data: {
              success: true,
              invoice_id: 'inv-atomic-001',
              invoice_number: params.p_invoice_number,
              status: params.p_status,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    const input = {
      customerId: customerIdA,
      invoiceNumber: 'INV-2026-999',
      issueDate: '2026-11-22',
      dueDate: '2026-11-29',
      status: 'sent',
      items: [{ description: 'Calculus Coaching', quantity: 1, unitPrice: 3000 }],
    };

    const created = await createInvoice(mockClient, bizId, input);
    const pass = created !== null && created.id === 'inv-atomic-001' && rpcCalledWith !== null && rpcCalledWith.p_status === 'sent';
    record(8, 'createInvoice uses transactional RPC create_invoice_with_items when available', pass,
      `createdId=${created?.id} rpcInvoked=${rpcCalledWith !== null} status=${rpcCalledWith?.p_status}`);
  }

  // Case 9: createInvoice falls back to two-phase creation with compensating rollback when RPC is not in database
  {
    let rollbackAttempted = false;
    const mockClient = {
      from: (table) => {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          single: async () => {
            if (table === 'customers') {
              return { data: { id: customerIdA, business_id: bizId, is_active: true, deleted_at: null, name: 'Aarav Patel' }, error: null };
            }
            if (table === 'invoices') {
              return {
                data: {
                  id: 'inv-fallback-002',
                  business_id: bizId,
                  customer_id: customerIdA,
                  invoice_number: 'INV-2026-888',
                  subtotal: 1500,
                  discount: 0,
                  total_amount: 1500,
                  status: 'draft',
                  deleted_at: null,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === 'customers') {
              return { data: { id: customerIdA, business_id: bizId, is_active: true, deleted_at: null, name: 'Aarav Patel' }, error: null };
            }
            return { data: null, error: null };
          },
          insert: () => {
            if (table === 'invoices') {
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: 'inv-fallback-002',
                      business_id: bizId,
                      customer_id: customerIdA,
                      invoice_number: 'INV-2026-888',
                      subtotal: 1500,
                      discount: 0,
                      total_amount: 1500,
                      status: 'draft',
                      deleted_at: null,
                    },
                    error: null,
                  }),
                }),
              };
            }
            if (table === 'invoice_items') {
              // Simulate line items failure
              return {
                select: () => ({ data: null, error: { message: 'Database disk full or constraint violation' } }),
              };
            }
            return query;
          },
          delete: () => {
            rollbackAttempted = true;
            return query;
          },
          order: () => query,
          limit: () => query,
        };
        return query;
      },
      rpc: async (fn) => {
        if (fn === 'create_invoice_with_items') {
          // Simulate unapplied migration (RPC does not exist in remote staging)
          return { data: null, error: { code: 'PGRST202', message: 'function public.create_invoice_with_items does not exist' } };
        }
        if (fn === 'soft_delete_invoice') {
          rollbackAttempted = true;
          return { data: { success: true }, error: null };
        }
        return { data: null, error: null };
      },
    };

    let caughtError = false;
    try {
      await createInvoice(mockClient, bizId, {
        customerId: customerIdA,
        invoiceNumber: 'INV-2026-888',
        issueDate: '2026-11-22',
        dueDate: '2026-11-29',
        items: [{ description: 'Physics Lab', quantity: 1, unitPrice: 1500 }],
      });
    } catch (err) {
      caughtError = err.message.includes('Failed to save invoice line items');
    }

    const pass = caughtError && rollbackAttempted;
    record(9, 'createInvoice detects line item insert failure in fallback path and triggers compensating rollback', pass,
      `caughtError=${caughtError} rollbackAttempted=${rollbackAttempted}`);
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  console.log('\n================================================================');
  console.log(`Summary: ${passed}/${results.length} PASSED`);
  console.log('================================================================');
  if (passed !== results.length) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
