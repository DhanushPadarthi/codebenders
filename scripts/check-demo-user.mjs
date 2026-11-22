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
const { data: { users } } = await admin.auth.admin.listUsers();
console.log('Total Users in Supabase Auth:', users.length);
for (const u of users) {
  console.log(`- ID: ${u.id} | Email: ${u.email} | Name: ${u.user_metadata?.full_name}`);
}

const { data: businesses } = await admin.from('businesses').select('id, name, owner_id');
console.log('\nTotal Businesses in DB:', businesses?.length || 0);
for (const b of (businesses || [])) {
  console.log(`- Biz ID: ${b.id} | Name: ${b.name} | Owner: ${b.owner_id}`);
}
