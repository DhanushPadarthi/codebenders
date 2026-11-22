// Source-contract regression guard. Runtime two-identity verification is NOT performed by this file.
//
// Checks that the Bearer branch of requireApiUser in lib/auth/require-user.ts
// returns a client bound to the validated bearer token (directClient), not the
// cookie-based server client. No network, no database, no secrets.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '..', 'lib', 'auth', 'require-user.ts');
const source = fs.readFileSync(target, 'utf8');

const START_MARKER = "if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {";
const END_MARKER = '// 2. Fall back';

let failures = 0;

function report(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failures += 1;
}

const startIdx = source.indexOf(START_MARKER);
const endIdx = startIdx >= 0 ? source.indexOf(END_MARKER, startIdx) : -1;
const bearerBranch =
  startIdx >= 0 && endIdx > startIdx ? source.slice(startIdx, endIdx) : '';

report('bearer branch markers located', bearerBranch.length > 0);

// (a) bearer branch must not use the cookie-based server client
report(
  '(a) bearer branch does NOT contain "createClient()" or "createClient().catch"',
  bearerBranch.length > 0 &&
    !bearerBranch.includes('createClient()') &&
    !bearerBranch.includes('createClient().catch')
);

// (b) bearer branch must return the token-bound client
report(
  '(b) bearer branch contains "supabase: directClient"',
  bearerBranch.includes('supabase: directClient')
);

// (c) bearer token must be validated server-side
report(
  '(c) bearer branch contains "auth.getUser(token)"',
  bearerBranch.includes('auth.getUser(token)')
);

if (failures > 0) {
  console.log(`${failures} assertion(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log('All assertions PASSED');
}
