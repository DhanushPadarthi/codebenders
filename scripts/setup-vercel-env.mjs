import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
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

const varsToSet = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
  'GROQ_TEXT_MODEL',
  'GROQ_VISION_MODEL',
];

console.log('Configuring Vercel production environment variables...');

for (const key of varsToSet) {
  const val = env[key];
  if (!val) {
    console.warn(`Skipping missing var: ${key}`);
    continue;
  }
  for (const target of ['production', 'preview']) {
    try {
      execSync(`npx vercel env add ${key} ${target} --value "${val}" --yes --force`, {
        stdio: 'ignore', // Never leak secrets to logs!
      });
      console.log(`  ✓ Added ${key} -> ${target}`);
    } catch {
      console.warn(`  ⚠ Could not set ${key} for ${target}`);
    }
  }
}

console.log('✓ Vercel environment variables configured successfully without printing secrets.');
