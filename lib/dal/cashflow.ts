import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getInvoices, type InvoiceRecord } from '@/lib/dal/invoices';
import { getBills, type BillRecord } from '@/lib/dal/bills';
import { getCustomers, type CustomerRecord } from '@/lib/dal/customers';
import {
  calculateCashflowForecast,
  simulateWhatIfScenario,
  type CashflowEngineInputs,
  type CashflowEngineResult,
  type WhatIfScenarioParams,
  type WhatIfSimulationResult,
} from '@/lib/finance/cashflow-engine';
import type {
  SampleInvoice,
  SampleBill,
  SampleCustomer,
  SamplePaymentPromise,
  ExpenseCategory,
  SampleInvoiceStatus,
} from '@/lib/sample-data';

type DbClient = Awaited<ReturnType<typeof createClient>>;

export interface PaymentPromiseRawRow {
  id: string;
  business_id: string;
  customer_id: string;
  invoice_id: string | null;
  raw_message: string;
  promised_amount: number | string;
  promised_date: string;
  status: 'pending' | 'fulfilled' | 'broken' | 'cancelled';
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentPromiseRecord {
  id: string;
  businessId: string;
  customerId: string;
  invoiceId?: string;
  rawMessage: string;
  promisedAmount: number;
  promisedAmountPaise: number;
  promisedDate: string;
  status: 'pending' | 'fulfilled' | 'broken' | 'cancelled';
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashflowScenarioRawRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  parameters: Record<string, unknown>;
  result_summary: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashflowScenarioRecord {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SaveScenarioSchema = z.object({
  name: z.string().trim().min(1, 'Scenario name is required').max(100),
  description: z.string().trim().max(500).optional().nullable(),
  parameters: z.record(z.unknown()),
  resultSummary: z.record(z.unknown()).optional().nullable(),
});

export type SaveScenarioInput = z.infer<typeof SaveScenarioSchema>;

export interface AggregatedCashflowState {
  openingCashBalance: number;
  asOfDate: string;
  invoices: InvoiceRecord[];
  bills: BillRecord[];
  customers: CustomerRecord[];
  promises: PaymentPromiseRecord[];
  scenarios: CashflowScenarioRecord[];
  forecastResult: CashflowEngineResult;
}

/**
 * Fetches active payment promises for the authenticated business.
 */
export async function getPaymentPromises(
  supabase: DbClient,
  businessId: string
): Promise<PaymentPromiseRecord[]> {
  const { data, error } = await supabase
    .from('payment_promises')
    .select('*')
    .eq('business_id', businessId)
    .order('promised_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to retrieve payment promises: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return (data as PaymentPromiseRawRow[]).map((row) => {
    const amount = Number(row.promised_amount ?? 0);
    const amountPaise = Math.round(amount * 100);
    return {
      id: row.id,
      businessId: row.business_id,
      customerId: row.customer_id,
      invoiceId: row.invoice_id || undefined,
      rawMessage: row.raw_message,
      promisedAmount: amountPaise / 100,
      promisedAmountPaise: amountPaise,
      promisedDate: row.promised_date,
      status: row.status,
      confidenceScore: Number(row.confidence_score ?? 0.85),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Fetches saved What-If cashflow scenarios for the business.
 */
/**
 * Fetches saved What-If cashflow scenarios for the business.
 * By default, excludes archived scenarios (is_active = false).
 */
export async function getCashflowScenarios(
  supabase: DbClient,
  businessId: string,
  options?: { includeArchived?: boolean }
): Promise<CashflowScenarioRecord[]> {
  let query = supabase
    .from('cashflow_scenarios')
    .select('*')
    .eq('business_id', businessId);

  if (!options?.includeArchived) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to retrieve cashflow scenarios: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return (data as CashflowScenarioRawRow[]).map((row) => ({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description || undefined,
    parameters: row.parameters || {},
    resultSummary: row.result_summary || undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Saves a new What-If cashflow scenario into PostgreSQL.
 */
export async function saveCashflowScenario(
  supabase: DbClient,
  businessId: string,
  input: SaveScenarioInput
): Promise<CashflowScenarioRecord> {
  const validated = SaveScenarioSchema.parse(input);

  const { data, error } = await supabase
    .from('cashflow_scenarios')
    .insert({
      business_id: businessId,
      name: validated.name,
      description: validated.description || null,
      parameters: validated.parameters,
      result_summary: validated.resultSummary || {},
      is_active: true,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save scenario: ${error?.message || 'Database error'}`);
  }

  const row = data as CashflowScenarioRawRow;
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description || undefined,
    parameters: row.parameters || {},
    resultSummary: row.result_summary || undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Archives a What-If cashflow scenario by setting is_active = false.
 * Strictly avoids physical deletion so simulation history is preserved in PostgreSQL.
 */
export async function deleteCashflowScenario(
  supabase: DbClient,
  businessId: string,
  scenarioId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('cashflow_scenarios')
    .update({ is_active: false })
    .eq('business_id', businessId)
    .eq('id', scenarioId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to archive scenario: ${error.message}`);
  }

  if (!data) {
    throw new Error('Scenario not found or access denied.');
  }

  return true;
}

export const archiveCashflowScenario = deleteCashflowScenario;

/**
 * Converts real database records into engine-compatible types for deterministic calculation.
 */
export function buildEngineInputs(
  openingCashBalance: number,
  invoices: InvoiceRecord[],
  bills: BillRecord[],
  customers: CustomerRecord[],
  promises: PaymentPromiseRecord[],
  options?: {
    asOfDate?: string;
    horizonDays?: 30 | 60 | 90;
    safeReserveThreshold?: number;
    scenario?: WhatIfScenarioParams;
  }
): CashflowEngineInputs {
  const asOfDate = options?.asOfDate || new Date().toISOString().slice(0, 10);
  const horizonDays = options?.horizonDays || 30;
  const safeReserveThreshold = options?.safeReserveThreshold ?? 50000;

  // Convert invoices to SampleInvoice format
  const sampleInvoices: SampleInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: inv.customerName,
    customerGrade: inv.customerGrade,
    parentName: inv.parentName || '—',
    parentPhone: inv.parentPhone || inv.customerId || '—',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotal: inv.subtotal,
    discount: inv.discount,
    totalAmount: inv.totalAmount,
    amountPaid: inv.amountPaid,
    balanceDue: inv.balanceDue,
    status: (inv.effectiveStatus || inv.status) as SampleInvoiceStatus,
    paymentTerms: 'Due on receipt',
    notes: inv.notes,
    items: (inv.items || []).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    })),
  }));

  // Convert bills to SampleBill format
  const sampleBills: SampleBill[] = bills.map((b) => ({
    id: b.id,
    title: b.title,
    vendorName: b.vendorName,
    category: b.uiCategory as ExpenseCategory,
    amount: b.amount,
    dueDate: b.dueDate,
    status: b.status,
    isRecurring: b.isRecurring,
    recurringFrequency: b.recurringFrequency,
    recurringDayOfMonth: b.recurringDayOfMonth,
    recurringEndDate: b.recurringEndDate,
    paidDate: b.paidDate,
    notes: b.notes,
  }));

  // Convert customers to SampleCustomer format
  const sampleCustomers: SampleCustomer[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    parentName: c.parentName || '—',
    gradeSubject: c.gradeSubject || 'General',
    email: c.email || undefined,
    phone: c.phone,
    whatsappNumber: c.whatsappNumber,
    defaultFeeAmount: c.defaultFeeAmount,
    billingCycleDay: c.billingCycleDay,
    status: c.status,
    notes: c.notes,
    totalInvoiced: c.totalInvoiced,
    totalCollected: c.totalCollected,
    outstandingBalance: c.outstandingBalance,
    nextPaymentDate: c.nextPaymentDate || asOfDate,
    overdueCount: c.overdueCount,
    joinedDate: c.joinedDate,
  }));

  // Convert promises to SamplePaymentPromise format
  const samplePromises: SamplePaymentPromise[] = promises.map((p) => ({
    id: p.id,
    customerId: p.customerId,
    invoiceId: p.invoiceId,
    rawMessage: p.rawMessage,
    promisedAmount: p.promisedAmount,
    promisedDate: p.promisedDate,
    status: p.status,
    confidenceScore: p.confidenceScore,
  }));

  return {
    asOfDate,
    horizonDays,
    openingCashBalance,
    invoices: sampleInvoices,
    bills: sampleBills,
    customers: sampleCustomers,
    promises: samplePromises,
    safeReserveThreshold,
    scenario: options?.scenario,
  };
}

/**
 * Aggregates all business financial data and executes the deterministic cashflow forecast.
 */
export async function getAggregatedCashflowState(
  supabase: DbClient,
  businessId: string,
  options?: {
    asOfDate?: string;
    horizonDays?: 30 | 60 | 90;
    safeReserveThreshold?: number;
    scenario?: WhatIfScenarioParams;
  }
): Promise<AggregatedCashflowState> {
  const asOfDate = options?.asOfDate || new Date().toISOString().slice(0, 10);

  // Fetch all core entities in parallel
  const [settingsRes, invoices, bills, customers, promises, scenarios] = await Promise.all([
    supabase
      .from('business_settings')
      .select('opening_cash_balance')
      .eq('business_id', businessId)
      .maybeSingle(),
    getInvoices(supabase, businessId),
    getBills(supabase, businessId, { includeArchived: false }),
    getCustomers(supabase, businessId, { includeArchived: false }),
    getPaymentPromises(supabase, businessId),
    getCashflowScenarios(supabase, businessId),
  ]);

  const openingCashBalance = Number(settingsRes.data?.opening_cash_balance ?? 0);

  const engineInputs = buildEngineInputs(
    openingCashBalance,
    invoices,
    bills,
    customers,
    promises,
    { ...options, asOfDate }
  );

  const forecastResult = calculateCashflowForecast(engineInputs);

  return {
    openingCashBalance,
    asOfDate,
    invoices,
    bills,
    customers,
    promises,
    scenarios,
    forecastResult,
  };
}

/**
 * Simulates a What-If scenario using real database inputs.
 */
export function simulateRealScenario(
  openingCashBalance: number,
  invoices: InvoiceRecord[],
  bills: BillRecord[],
  customers: CustomerRecord[],
  promises: PaymentPromiseRecord[],
  scenario: WhatIfScenarioParams,
  options?: {
    asOfDate?: string;
    horizonDays?: 30 | 60 | 90;
    safeReserveThreshold?: number;
  }
): WhatIfSimulationResult {
  const engineInputs = buildEngineInputs(
    openingCashBalance,
    invoices,
    bills,
    customers,
    promises,
    options
  );

  return simulateWhatIfScenario(engineInputs, scenario);
}

