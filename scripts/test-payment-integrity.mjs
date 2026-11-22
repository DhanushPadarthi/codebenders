/**
 * FeePulse Payment Integrity & Idempotency Regression Test Suite
 *
 * Verifies:
 * 1. Payment amount currency precision (strictly <= 2 decimal places)
 * 2. RecordPaymentSchema validation (rejects invalid amounts, types, and modes)
 * 3. Pre-flight duplicate reference rejection before invoking database RPC
 * 4. Overpayment prevention in integer paise
 * 5. Same request retried twice creates only one payment
 * 6. Two separate legitimate ₹1,000 cash payments on same invoice & date are both accepted
 * 7. Same external UTR / Cheque reference submitted twice is rejected (duplicate UTR)
 * 8. Network retry retains its original idempotency key
 * 9. Cash payments without external references reliably bind idempotency key
 * 10. Database unique constraint violation (code 23505) is translated to duplicate error
 */

import {
  isValidCurrencyPrecision,
  RecordPaymentSchema,
  recordInvoicePayment,
} from '../lib/dal/payments.ts';

console.log('================================================================');
console.log('FeePulse Payment Integrity & Idempotency Regression Suite');
console.log('================================================================\n');

const results = [];
function record(caseNum, name, pass, detail = '') {
  results.push({ caseNum, name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} [Case ${caseNum}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function runTests() {
  const bizId = '11111111-1111-1111-1111-111111111111';
  const invId = '22222222-2222-2222-2222-222222222222';

  // Case 1: Currency precision in payment amounts
  {
    const validAmounts = [100, 100.5, 100.55, 5000.01];
    const invalidAmounts = [100.555, 0.001, 100.12345, 1e-3];

    const allValids = validAmounts.every(isValidCurrencyPrecision);
    const allInvalids = invalidAmounts.every((v) => !isValidCurrencyPrecision(v));
    record(1, 'Payment amount precision enforces max 2 decimal places', allValids && allInvalids,
      `valids=${allValids} invalidsRejected=${allInvalids}`);
  }

  // Case 2: RecordPaymentSchema validation
  {
    const base = {
      invoiceId: invId,
      amount: 1500.50,
      paymentMode: 'upi',
      paymentDate: '2026-11-22',
      referenceId: 'UPI-UTR-99998888',
    };

    const valid = RecordPaymentSchema.safeParse(base);
    const invalidPrice = RecordPaymentSchema.safeParse({ ...base, amount: 1500.555 });
    const invalidZero = RecordPaymentSchema.safeParse({ ...base, amount: 0 });
    const invalidNegative = RecordPaymentSchema.safeParse({ ...base, amount: -100 });
    const invalidMode = RecordPaymentSchema.safeParse({ ...base, paymentMode: 'bitcoin' });

    const pass = valid.success && !invalidPrice.success && !invalidZero.success && !invalidNegative.success && !invalidMode.success;
    record(2, 'RecordPaymentSchema rejects 3-decimal amounts, non-positive amounts and invalid payment modes', pass,
      `valid=${valid.success} 3decErr=${!invalidPrice.success} zeroErr=${!invalidZero.success} modeErr=${!invalidMode.success}`);
  }

  // Case 3: Duplicate reference ID rejection (idempotency)
  {
    const existingPayment = {
      id: 'pay-1',
      invoice_id: invId,
      amount: 1500,
      payment_date: '2026-11-22',
      reference_id: 'UPI-UTR-123456789012',
    };

    const mockSupabase = {
      from: (table) => {
        let filters = {};
        const query = {
          select: () => query,
          eq: (f, v) => {
            filters[f] = v;
            return query;
          },
          gte: () => query,
          maybeSingle: async () => {
            if (table === 'invoices') {
              return {
                data: {
                  id: invId,
                  business_id: bizId,
                  customer_id: 'cust-1',
                  total_amount: 5000,
                  amount_paid: 1500,
                  balance_due: 3500,
                  status: 'sent',
                  deleted_at: null,
                  invoice_number: 'INV-2026-001',
                },
                error: null,
              };
            }
            if (table === 'payments') {
              if (filters.reference_id === 'UPI-UTR-123456789012') {
                return { data: existingPayment, error: null };
              }
              return { data: null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
      rpc: async () => {
        throw new Error('RPC should not be called on duplicate reference');
      },
    };

    let duplicateRejected = false;
    try {
      await recordInvoicePayment(mockSupabase, bizId, {
        invoiceId: invId,
        amount: 1000,
        paymentMode: 'upi',
        paymentDate: '2026-11-22',
        referenceId: 'UPI-UTR-123456789012',
      });
    } catch (err) {
      duplicateRejected = err.message.includes('Duplicate payment rejected');
    }

    record(3, 'recordInvoicePayment rejects duplicate reference ID before database RPC', duplicateRejected,
      `rejected=${duplicateRejected}`);
  }

  // Case 4: Overpayment prevention in integer paise
  {
    const mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: invId,
                  business_id: bizId,
                  customer_id: 'cust-1',
                  total_amount: 5000,
                  amount_paid: 4500,
                  balance_due: 500, // Only 500 remaining!
                  status: 'sent',
                  deleted_at: null,
                  invoice_number: 'INV-2026-001',
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
      rpc: async () => {
        throw new Error('RPC should not be called when overpayment detected');
      },
    };

    let overpaymentRejected = false;
    try {
      await recordInvoicePayment(mockSupabase, bizId, {
        invoiceId: invId,
        amount: 500.01, // 1 paisa over remaining balance!
        paymentMode: 'upi',
        paymentDate: '2026-11-22',
      });
    } catch (err) {
      overpaymentRejected = err.message.includes('exceeds remaining invoice balance due');
    }

    record(4, 'recordInvoicePayment prevents overpayments exceeding balance due', overpaymentRejected,
      `rejected=${overpaymentRejected}`);
  }

  // Case 5: Same request retried twice creates one payment
  {
    let callCount = 0;
    const recordedPayments = [];

    const mockSupabase = {
      from: (table) => {
        let filters = {};
        const query = {
          select: () => query,
          eq: (f, v) => {
            filters[f] = v;
            return query;
          },
          gte: () => query,
          maybeSingle: async () => {
            if (table === 'invoices') {
              return {
                data: {
                  id: invId,
                  business_id: bizId,
                  customer_id: 'cust-1',
                  total_amount: 5000,
                  amount_paid: callCount === 0 ? 0 : 2000,
                  balance_due: callCount === 0 ? 5000 : 3000,
                  status: 'sent',
                  deleted_at: null,
                  invoice_number: 'INV-2026-001',
                },
                error: null,
              };
            }
            if (table === 'payments') {
              if (filters.reference_id) {
                const match = recordedPayments.find((p) => p.reference_id === filters.reference_id);
                return { data: match || null, error: null };
              }
              return { data: null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
      rpc: async (fn, params) => {
        callCount++;
        recordedPayments.push({
          id: 'pay-first',
          invoice_id: params.p_invoice_id,
          amount: params.p_amount,
          reference_id: params.p_reference_id,
          created_at: new Date().toISOString(),
        });
        return {
          data: {
            payment_id: 'pay-first',
            invoice_id: params.p_invoice_id,
            amount_paid: 2000,
            balance_due: 3000,
            status: 'partially_paid',
          },
          error: null,
        };
      },
    };

    const paymentInput = {
      invoiceId: invId,
      amount: 2000,
      paymentMode: 'bank_transfer',
      paymentDate: '2026-11-22',
      idempotencyKey: 'idemp-req-001',
    };

    // First submission succeeds
    const firstResult = await recordInvoicePayment(mockSupabase, bizId, paymentInput);

    // Second repeated submission must fail!
    let secondFailed = false;
    try {
      await recordInvoicePayment(mockSupabase, bizId, paymentInput);
    } catch (err) {
      secondFailed = err.message.includes('Duplicate payment rejected');
    }

    const pass = firstResult.success === true && secondFailed === true && callCount === 1 && recordedPayments.length === 1;
    record(5, 'Same request retried twice creates one payment', pass,
      `firstSuccess=${firstResult.success} retryRejected=${secondFailed} rpcCalls=${callCount} payments=${recordedPayments.length}`);
  }

  // Case 6: Two separate legitimate ₹1,000 cash payments on the same invoice and date are both accepted
  {
    const recordedPayments = [];
    let invoiceState = {
      id: invId,
      business_id: bizId,
      customer_id: 'cust-1',
      total_amount: 5000,
      amount_paid: 0,
      balance_due: 5000,
      status: 'sent',
      deleted_at: null,
      invoice_number: 'INV-2026-001',
    };

    const mockSupabase = {
      from: (table) => {
        let filters = {};
        const query = {
          select: () => query,
          eq: (f, v) => {
            filters[f] = v;
            return query;
          },
          gte: () => query,
          maybeSingle: async () => {
            if (table === 'invoices') {
              return { data: { ...invoiceState }, error: null };
            }
            if (table === 'payments') {
              if (filters.reference_id) {
                const match = recordedPayments.find((p) => p.reference_id === filters.reference_id);
                return { data: match || null, error: null };
              }
              return { data: null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
      rpc: async (fn, params) => {
        const payId = `pay-cash-${recordedPayments.length + 1}`;
        recordedPayments.push({
          id: payId,
          invoice_id: params.p_invoice_id,
          amount: params.p_amount,
          reference_id: params.p_reference_id,
          payment_mode: params.p_payment_mode,
          payment_date: params.p_payment_date,
        });

        invoiceState.amount_paid += params.p_amount;
        invoiceState.balance_due -= params.p_amount;
        invoiceState.status = invoiceState.balance_due === 0 ? 'paid' : 'partially_paid';

        return {
          data: {
            payment_id: payId,
            invoice_id: params.p_invoice_id,
            amount_paid: invoiceState.amount_paid,
            balance_due: invoiceState.balance_due,
            status: invoiceState.status,
          },
          error: null,
        };
      },
    };

    // Legitimate Cash Payment 1 (e.g. morning installment of ₹1000)
    const payment1 = await recordInvoicePayment(mockSupabase, bizId, {
      invoiceId: invId,
      amount: 1000,
      paymentMode: 'cash',
      paymentDate: '2026-11-22',
      idempotencyKey: 'REQ-CASH-MORNING-001',
    });

    // Legitimate Cash Payment 2 (e.g. evening installment of ₹1000 on SAME invoice and SAME date)
    const payment2 = await recordInvoicePayment(mockSupabase, bizId, {
      invoiceId: invId,
      amount: 1000,
      paymentMode: 'cash',
      paymentDate: '2026-11-22',
      idempotencyKey: 'REQ-CASH-EVENING-002',
    });

    const pass =
      payment1.success === true &&
      payment2.success === true &&
      recordedPayments.length === 2 &&
      invoiceState.amount_paid === 2000 &&
      invoiceState.balance_due === 3000 &&
      recordedPayments[0].reference_id === 'REQ-CASH-MORNING-001' &&
      recordedPayments[1].reference_id === 'REQ-CASH-EVENING-002';

    record(
      6,
      'Two separate legitimate ₹1,000 cash payments on same invoice and date are both accepted',
      pass,
      `pay1Success=${payment1.success} pay2Success=${payment2.success} totalPaid=${invoiceState.amount_paid} recordedCount=${recordedPayments.length}`
    );
  }

  // Case 7: Same UTR submitted twice is rejected
  {
    const recordedPayments = [
      {
        id: 'pay-existing-utr',
        business_id: bizId,
        invoice_id: invId,
        amount: 1500,
        payment_mode: 'upi',
        reference_id: 'UPI-UTR-999888777111',
      },
    ];

    const mockSupabase = {
      from: (table) => {
        let filters = {};
        const query = {
          select: () => query,
          eq: (f, v) => {
            filters[f] = v;
            return query;
          },
          gte: () => query,
          maybeSingle: async () => {
            if (table === 'invoices') {
              return {
                data: {
                  id: invId,
                  business_id: bizId,
                  customer_id: 'cust-1',
                  total_amount: 5000,
                  amount_paid: 1500,
                  balance_due: 3500,
                  status: 'sent',
                  deleted_at: null,
                  invoice_number: 'INV-2026-001',
                },
                error: null,
              };
            }
            if (table === 'payments') {
              if (filters.reference_id === 'UPI-UTR-999888777111') {
                return { data: recordedPayments[0], error: null };
              }
              return { data: null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
      rpc: async () => {
        throw new Error('RPC must not execute on reused external UTR');
      },
    };

    let utrRejected = false;
    let utrError = '';
    try {
      // User attempts to record payment using the SAME UTR with a different request ID
      await recordInvoicePayment(mockSupabase, bizId, {
        invoiceId: invId,
        amount: 1500,
        paymentMode: 'upi',
        paymentDate: '2026-11-22',
        referenceId: 'UPI-UTR-999888777111',
        idempotencyKey: 'NEW-REQUEST-KEY-DIFFERENT',
      });
    } catch (err) {
      utrRejected = err.message.includes('Duplicate payment rejected');
      utrError = err.message;
    }

    record(7, 'Same UTR submitted twice is rejected (duplicate UTR protection)', utrRejected,
      `rejected=${utrRejected} err="${utrError.slice(0, 45)}..."`);
  }

  // Case 8: Network retry retains its original idempotency key
  {
    const originalInput = {
      invoiceId: invId,
      amount: 1200,
      paymentMode: 'cash',
      paymentDate: '2026-11-22',
      idempotencyKey: 'IDEMP-NETWORK-RETRY-STABLE',
    };

    let attempts = 0;
    const capturedRefs = [];

    const mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'invoices') {
                  return {
                    data: {
                      id: invId,
                      business_id: bizId,
                      customer_id: 'cust-1',
                      total_amount: 5000,
                      amount_paid: 0,
                      balance_due: 5000,
                      status: 'sent',
                      deleted_at: null,
                      invoice_number: 'INV-2026-001',
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
          }),
        }),
      }),
      rpc: async (fn, params) => {
        attempts++;
        capturedRefs.push(params.p_reference_id);
        if (attempts === 1) {
          // Simulate transient 504 Gateway Timeout or network drop on attempt 1
          throw new Error('Network timeout: connection reset by peer');
        }
        return {
          data: {
            payment_id: 'pay-recovered',
            invoice_id: params.p_invoice_id,
            amount_paid: 1200,
            balance_due: 3800,
            status: 'partially_paid',
          },
          error: null,
        };
      },
    };

    // Attempt 1: Fails due to network error
    let attempt1Failed = false;
    try {
      await recordInvoicePayment(mockSupabase, bizId, originalInput);
    } catch (err) {
      attempt1Failed = err.message.includes('Network timeout');
    }

    // Attempt 2: Network retry using the same request input
    const retryResult = await recordInvoicePayment(mockSupabase, bizId, originalInput);

    const pass =
      attempt1Failed &&
      retryResult.success === true &&
      capturedRefs.length === 2 &&
      capturedRefs[0] === capturedRefs[1] &&
      capturedRefs[0] === 'IDEMP-NETWORK-RETRY-STABLE' &&
      originalInput.idempotencyKey === 'IDEMP-NETWORK-RETRY-STABLE';

    record(8, 'Network retry retains its original idempotency key across attempts', pass,
      `attempt1Failed=${attempt1Failed} retrySuccess=${retryResult.success} ref1=${capturedRefs[0]} ref2=${capturedRefs[1]}`);
  }

  // Case 9: Cash payment without external reference binds explicit idempotency key
  {
    let passedRefToRpc = null;
    const mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'invoices') {
                  return {
                    data: {
                      id: invId,
                      business_id: bizId,
                      customer_id: 'cust-1',
                      total_amount: 5000,
                      amount_paid: 0,
                      balance_due: 5000,
                      status: 'sent',
                      deleted_at: null,
                      invoice_number: 'INV-2026-001',
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
          }),
        }),
      }),
      rpc: async (fn, params) => {
        passedRefToRpc = params.p_reference_id;
        return {
          data: {
            payment_id: 'pay-cash-1',
            invoice_id: params.p_invoice_id,
            amount_paid: 500,
            balance_due: 4500,
            status: 'partially_paid',
          },
          error: null,
        };
      },
    };

    const res = await recordInvoicePayment(mockSupabase, bizId, {
      invoiceId: invId,
      amount: 500,
      paymentMode: 'cash',
      paymentDate: '2026-11-22',
      idempotencyKey: 'IDEMP-CASH-777',
    });

    const pass = res.success === true && passedRefToRpc === 'IDEMP-CASH-777';
    record(9, 'Cash payment without external reference binds explicit idempotency key to database RPC', pass,
      `success=${res.success} effectiveRef=${passedRefToRpc}`);
  }

  // Case 10: Database unique constraint error 23505 from RPC is caught and returns clean duplicate rejection
  {
    const mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'invoices') {
                  return {
                    data: {
                      id: invId,
                      business_id: bizId,
                      customer_id: 'cust-1',
                      total_amount: 5000,
                      amount_paid: 0,
                      balance_due: 5000,
                      status: 'sent',
                      deleted_at: null,
                      invoice_number: 'INV-2026-001',
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
          }),
        }),
      }),
      rpc: async () => {
        return {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "uq_payments_business_reference"',
          },
        };
      },
    };

    let caughtAsDuplicate = false;
    try {
      await recordInvoicePayment(mockSupabase, bizId, {
        invoiceId: invId,
        amount: 1000,
        paymentMode: 'upi',
        paymentDate: '2026-11-22',
        referenceId: 'UPI-CONCURRENT-999',
      });
    } catch (err) {
      caughtAsDuplicate = err.message.includes('Duplicate payment rejected');
    }

    record(10, 'Database unique constraint error 23505 from RPC is translated to clean duplicate rejection', caughtAsDuplicate,
      `caughtAsDuplicate=${caughtAsDuplicate}`);
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
