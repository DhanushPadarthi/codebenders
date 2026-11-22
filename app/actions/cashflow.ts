'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { getBusinessContext } from '@/lib/auth/get-business-context';
import {
  getAggregatedCashflowState,
  getCashflowScenarios,
  saveCashflowScenario,
  deleteCashflowScenario,
  simulateRealScenario,
  SaveScenarioSchema,
  type SaveScenarioInput,
  type CashflowScenarioRecord,
  type AggregatedCashflowState,
} from '@/lib/dal/cashflow';
import type { WhatIfScenarioParams, WhatIfSimulationResult } from '@/lib/finance/cashflow-engine';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

/**
 * Server Action: Calculates cashflow forecast from persistent PostgreSQL records.
 */
export async function getCashflowForecastAction(options?: {
  horizonDays?: 30 | 60 | 90;
  safeReserveThreshold?: number;
}): Promise<ActionResult<AggregatedCashflowState>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const state = await getAggregatedCashflowState(supabase, context.business.id, options);
    return { success: true, data: state };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to calculate cashflow forecast.';
    console.error('getCashflowForecastAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Fetches saved What-If scenarios.
 */
export async function getSavedScenariosAction(): Promise<ActionResult<CashflowScenarioRecord[]>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const scenarios = await getCashflowScenarios(supabase, context.business.id);
    return { success: true, data: scenarios };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve scenarios.';
    console.error('getSavedScenariosAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Saves a What-If scenario.
 */
export async function saveScenarioAction(
  input: SaveScenarioInput
): Promise<ActionResult<CashflowScenarioRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = SaveScenarioSchema.safeParse(input);
    if (!validation.success) {
      return { success: false, error: 'Invalid scenario parameters.' };
    }

    const scenario = await saveCashflowScenario(supabase, context.business.id, validation.data);

    revalidatePath('/cashflow');

    return { success: true, data: scenario };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save scenario.';
    console.error('saveScenarioAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Deletes (archives) a What-If scenario.
 */
export async function deleteScenarioAction(scenarioId: string): Promise<ActionResult<boolean>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const success = await deleteCashflowScenario(supabase, context.business.id, scenarioId);

    revalidatePath('/cashflow');

    return { success: true, data: success };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to archive scenario.';
    console.error('deleteScenarioAction error:', message);
    return { success: false, error: message };
  }
}

export const archiveScenarioAction = deleteScenarioAction;

/**
 * Server Action: Simulates a scenario against real business records.
 */
export async function simulateScenarioAction(
  scenario: WhatIfScenarioParams,
  options?: {
    horizonDays?: 30 | 60 | 90;
    safeReserveThreshold?: number;
  }
): Promise<ActionResult<WhatIfSimulationResult>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const state = await getAggregatedCashflowState(supabase, context.business.id, options);
    const result = simulateRealScenario(
      state.openingCashBalance,
      state.invoices,
      state.bills,
      state.customers,
      state.promises,
      scenario,
      options
    );

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run scenario simulation.';
    console.error('simulateScenarioAction error:', message);
    return { success: false, error: message };
  }
}
