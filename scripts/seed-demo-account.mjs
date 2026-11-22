import fs from 'fs';
import path from 'path';

// Load .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[trimmed.slice(0, eqIdx).trim()] = v;
  }
}

const { ensureDemoAccount, DEMO_USER_EMAIL } = await import('../lib/auth/demo-account.ts');

console.log('================================================================');
console.log('FeePulse — Seeding Dedicated Judge Demo Account');
console.log('Target Email:', DEMO_USER_EMAIL);
console.log('================================================================\n');

try {
  const result = await ensureDemoAccount();
  console.log('✓ Demo account provisioned & seeded successfully:');
  console.log(result);
} catch (err) {
  console.error('❌ Failed to provision demo account:', err);
  process.exit(1);
}
