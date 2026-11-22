import fs from 'fs';

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

function parseJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
}

console.log('ANON_KEY role:', parseJwt(env['NEXT_PUBLIC_SUPABASE_ANON_KEY'])?.role);
console.log('SERVICE_ROLE_KEY role:', parseJwt(env['SUPABASE_SERVICE_ROLE_KEY'])?.role);
