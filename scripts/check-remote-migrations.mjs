import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[trimmed.slice(0, eqIdx).trim()] = v;
  }
}

const admin = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const tables = [
  'businesses',
  'customers',
  'invoices',
  'invoice_items',
  'payments',
  'bills',
  'payment_promises',
  'recovery_follow_ups',
  'ai_usage_quotas',
  'ai_request_logs',
  'cashflow_scenarios',
];

console.log('Checking tables in remote Supabase:');
for (const t of tables) {
  const { data, error } = await admin.from(t).select('*').limit(1);
  if (error) {
    console.log(`❌ ${t}: ${error.message} (code: ${error.code})`);
  } else {
    console.log(`✓ ${t}: exists (sample rows: ${data?.length})`);
  }
}

// Check remote RPCs
console.log('\nChecking remote RPCs:');
const rpcs = [
  'record_invoice_payment',
  'consume_ai_quota',
  'refund_ai_quota',
  'create_invoice_with_items',
];

for (const rpc of rpcs) {
  const { data, error } = await admin.rpc(rpc, {});
  console.log(`- RPC [${rpc}]: ${error ? error.message : 'OK'}`);
}
