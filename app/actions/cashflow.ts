'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser, handleActionError } from '@/lib/auth/require-user';
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
    console.error('getCashflowForecastAction error:', err);
    return handleActionError(err, 'Failed to calculate cashflow forecast.');
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
    console.error('getSavedScenariosAction error:', err);
    return handleActionError(err, 'Failed to retrieve scenarios.');
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
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Invalid scenario parameters.',
        details: fieldErrors,
      };
    }

    const scenario = await saveCashflowScenario(supabase, context.business.id, validation.data);

    revalidatePath('/cashflow');

    return { success: true, data: scenario };
  } catch (err: unknown) {
    console.error('saveScenarioAction error:', err);
    return handleActionError(err, 'Failed to save scenario.');
  }
}

/**
 * Server Action: Deletes (archives) a What-If scenario.
 */
export async function deleteScenarioAction(scenarioId: string): Promise<ActionResult<boolean>> {
  try {
    if (!z.string().uuid().safeParse(scenarioId).success) {
      return { success: false, error: 'Invalid scenario ID format.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const success = await deleteCashflowScenario(supabase, context.business.id, scenarioId);

    revalidatePath('/cashflow');

    return { success: true, data: success };
  } catch (err: unknown) {
    console.error('deleteScenarioAction error:', err);
    return handleActionError(err, 'Failed to archive scenario.');
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
    console.error('simulateScenarioAction error:', err);
    return handleActionError(err, 'Failed to run scenario simulation.');
  }
}
