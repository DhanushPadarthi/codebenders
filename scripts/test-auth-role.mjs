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

const admin = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

// Create a test user
const email = `auth-test-${Date.now()}@feepulse.internal`;
const password = `TestAuth!${Date.now()}#`;
const { data: user, error: uErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Auth Test' },
});
if (uErr) throw uErr;

const anon = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
const { data: sessionData, error: sErr } = await anon.auth.signInWithPassword({ email, password });
if (sErr) throw sErr;

const userClient = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY'], {
  global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } }
});

const { data: newBiz, error: bErr } = await userClient.from('businesses').insert({
  name: 'Test Academy',
  owner_id: user.user.id,
  currency: 'INR'
}).select().single();

console.log('Business insert result:', { id: newBiz?.id, error: bErr?.message });

// Clean up
await admin.auth.admin.deleteUser(user.user.id);
console.log('Cleaned up test user');
