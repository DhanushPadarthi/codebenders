import fs from 'fs';
import path from 'path';
import net from 'net';

const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env.local does not exist');
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

const requiredKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'GROQ_API_KEY',
  'GROQ_TEXT_MODEL',
  'GROQ_VISION_MODEL'
];

let allKeysPresent = true;
for (const key of requiredKeys) {
  if (!env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    allKeysPresent = false;
  }
}

if (!allKeysPresent) {
  process.exit(1);
}

console.log('✓ All required environment variable names are present');

async function testGroqText() {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env['GROQ_API_KEY']}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env['GROQ_TEXT_MODEL'],
        messages: [{ role: 'user', content: 'healthcheck' }],
        max_tokens: 5
      })
    });
    if (res.status === 200) {
      console.log(`✓ Groq Text Model (${env['GROQ_TEXT_MODEL']}): HTTP 200 OK`);
      return true;
    } else {
      console.error(`✗ Groq Text Model: HTTP ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error(`✗ Groq Text connection failed: ${err.message}`);
    return false;
  }
}

async function testGroqVision() {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env['GROQ_API_KEY']}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env['GROQ_VISION_MODEL'],
        messages: [{ role: 'user', content: 'healthcheck' }],
        max_tokens: 5
      })
    });
    if (res.status === 200) {
      console.log(`✓ Groq Vision Model (${env['GROQ_VISION_MODEL']}): HTTP 200 OK`);
      return true;
    } else {
      console.error(`✗ Groq Vision Model: HTTP ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error(`✗ Groq Vision connection failed: ${err.message}`);
    return false;
  }
}

async function testSupabase() {
  try {
    const url = `${env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/`;
    const res = await fetch(url, {
      headers: {
        'apikey': env['SUPABASE_SERVICE_ROLE_KEY'],
        'Authorization': `Bearer ${env['SUPABASE_SERVICE_ROLE_KEY']}`
      }
    });
    if (res.status === 200) {
      console.log('✓ Supabase REST API: HTTP 200 OK (Authenticated via service role)');
      return true;
    } else {
      console.error(`✗ Supabase REST API: HTTP ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error(`✗ Supabase connection failed: ${err.message}`);
    return false;
  }
}

function testDatabaseTCP() {
  return new Promise((resolve) => {
    const client = net.createConnection({
      host: 'aws-1-ap-southeast-1.pooler.supabase.com',
      port: 6543
    }, () => {
      console.log('✓ Supabase PostgreSQL Pooler: TCP port 6543 reachable');
      client.end();
      resolve(true);
    });
    client.on('error', (err) => {
      console.error(`✗ PostgreSQL Pooler connection failed: ${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  const [textOk, visionOk, supaOk, dbOk] = await Promise.all([
    testGroqText(),
    testGroqVision(),
    testSupabase(),
    testDatabaseTCP()
  ]);

  if (textOk && visionOk && supaOk && dbOk) {
    console.log('✓ All environment & connectivity checks passed successfully.');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
