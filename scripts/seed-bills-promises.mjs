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

// Insert bills
const bills = [
  { title: "Coaching Centre Rent (Sector 14)", vendor_name: "Vasanth Commercial Properties", category: "rent", amount: 35000, due_date: "2026-11-26", status: "unpaid", is_recurring: true, recurring_frequency: "monthly" },
  { title: "Faculty Honorarium - Advanced Physics", vendor_name: "Prof. S. K. Gupta", category: "salary", amount: 22000, due_date: "2026-12-01", status: "unpaid", is_recurring: true, recurring_frequency: "monthly" },
  { title: "Commercial Power & High-Speed Broadband", vendor_name: "Airtel Broadband & BSES", category: "electricity", amount: 4200, due_date: "2026-11-20", status: "overdue", is_recurring: true, recurring_frequency: "monthly" },
  { title: "Term 1 Formula Sheets & Test Booklets", vendor_name: "City Print & Stationery Works", category: "materials", amount: 4800, due_date: "2026-11-15", status: "paid", paid_date: "2026-11-15", is_recurring: false },
];

for (const b of bills) {
  const { error } = await userClient.from('bills').insert({ ...b, business_id: bizId });
  if (error) console.error('Bill insert err:', error.message);
}

// Get customer and invoice IDs
const { data: custs } = await userClient.from('customers').select('id, name').eq('business_id', bizId);
const { data: invs } = await userClient.from('invoices').select('id, invoice_number').eq('business_id', bizId);
const custMap = Object.fromEntries(custs.map(c => [c.name, c.id]));
const invMap = Object.fromEntries(invs.map(i => [i.invoice_number, i.id]));

if (custMap["Arjun Verma"] && invMap["INV-2026-085"]) {
  const { error } = await userClient.from("payment_promises").insert({
    business_id: bizId,
    customer_id: custMap["Arjun Verma"],
    invoice_id: invMap["INV-2026-085"],
    promised_amount: 8500,
    promised_date: "2026-11-24",
    raw_message: "Sir will settle full 8500 by Tuesday 24 Nov evening via Google Pay.",
    status: "pending",
    confidence_score: 0.95,
  });
  if (error) console.error('Promise err 1:', error.message);
}

if (custMap["Priya Nair"] && invMap["INV-2026-086"]) {
  const { error } = await userClient.from("payment_promises").insert({
    business_id: bizId,
    customer_id: custMap["Priya Nair"],
    invoice_id: invMap["INV-2026-086"],
    promised_amount: 6000,
    promised_date: "2026-11-22",
    raw_message: "Remaining 6000 will be paid today evening after office.",
    status: "pending",
    confidence_score: 0.98,
  });
  if (error) console.error('Promise err 2:', error.message);
}

if (custMap["Ananya Iyer"] && invMap["INV-2026-088"]) {
  const { error } = await userClient.from("payment_promises").insert({
    business_id: bizId,
    customer_id: custMap["Ananya Iyer"],
    invoice_id: invMap["INV-2026-088"],
    promised_amount: 9500,
    promised_date: "2026-11-18",
    raw_message: "Will clear pending 9500 by 18th November.",
    status: "broken",
    confidence_score: 0.92,
  });
  if (error) console.error('Promise err 3:', error.message);
}

console.log('Finished seeding bills and promises.');
