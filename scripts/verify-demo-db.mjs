import fs from 'fs';
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

const anon = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
const { data: s } = await anon.auth.signInWithPassword({
  email: 'demo@feepulse.internal',
  password: 'FeePulseDemo#2026!Judge',
});

const userClient = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY'], {
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } }
});

const bizId = 'f47ad773-0fb4-4fe8-886c-dc4420898b22';
const [c, i, p, b, pr] = await Promise.all([
  userClient.from('customers').select('*').eq('business_id', bizId),
  userClient.from('invoices').select('*').eq('business_id', bizId),
  userClient.from('payments').select('*').eq('business_id', bizId),
  userClient.from('bills').select('*').eq('business_id', bizId),
  userClient.from('payment_promises').select('*').eq('business_id', bizId),
]);

console.log('--- Dedicated Demo Account Verification ---');
console.log(`Students: ${c.data?.length}`);
console.log(`Invoices: ${i.data?.length}`);
console.log(`Payments: ${p.data?.length}`);
console.log(`Bills: ${b.data?.length}`);
console.log(`Promises: ${pr.data?.length}`);
