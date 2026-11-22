import { execSync } from 'child_process';

console.log('=== Step 1/17: SQL Structural & Balance Validation ===');
execSync('node scripts/validate-sql.mjs', { stdio: 'inherit' });

console.log('\n=== Step 2/17: Environment & Connectivity Verification ===');
execSync('node scripts/verify-env.mjs', { stdio: 'inherit' });

console.log('\n=== Step 3/17: ESLint Hygiene Check ===');
execSync('npm run lint', { stdio: 'inherit' });

console.log('\n=== Step 4/17: Deterministic Cashflow Engine Test Suite ===');
execSync('node --experimental-strip-types scripts/test-cashflow-engine.mjs', { stdio: 'inherit' });

console.log('\n=== Step 5/17: Smart Recovery Queue & Priority Scoring Test Suite ===');
execSync('node --experimental-strip-types scripts/test-recovery-queue.mjs', { stdio: 'inherit' });

console.log('\n=== Step 6/17: AI Assistant & Document Scanner Test Suite ===');
execSync('node --experimental-strip-types scripts/test-ai-assistant.mjs', { stdio: 'inherit' });

console.log('\n=== Step 7/17: Customer & Student Directory Integration Test Suite ===');
execSync('node scripts/test-customers.mjs', { stdio: 'inherit' });

console.log('\n=== Step 8/17: Invoice Management Integration Test Suite ===');
execSync('node scripts/test-invoices.mjs', { stdio: 'inherit' });

console.log('\n=== Step 9/17: Payments & Fee Collection Integration Test Suite ===');
execSync('node scripts/test-payments.mjs', { stdio: 'inherit' });

console.log('\n=== Step 10/17: Bills & Expenses Integration Test Suite ===');
execSync('node scripts/test-expenses.mjs', { stdio: 'inherit' });

console.log('\n=== Step 11/17: Cashflow Forecasting Integration Test Suite ===');
execSync('node --experimental-strip-types scripts/test-cashflow-integration.mjs', { stdio: 'inherit' });

console.log('\n=== Step 12/17: Smart Recovery Queue Integration Test Suite ===');
execSync('node --experimental-strip-types scripts/test-recovery-integration.mjs', { stdio: 'inherit' });

console.log('\n=== Step 13/17: Recovery & Cashflow Direct Database Vulnerability Verification ===');
execSync('node --experimental-strip-types scripts/test-database-vulnerabilities.mjs', { stdio: 'inherit' });

console.log('\n=== Step 14/17: Recovery & Cashflow Application DAL Integrity Audit Suite ===');
execSync('node --experimental-strip-types scripts/test-integrity-audit.mjs', { stdio: 'inherit' });

console.log('\n=== Step 15/17: Live Dashboard Integration Test Suite ===');
execSync('node --experimental-strip-types scripts/test-dashboard.mjs', { stdio: 'inherit' });

console.log('\n=== Step 16/17: AI Assistant Multi-Tenant PostgreSQL Integration Test Suite ===');
execSync('node --experimental-strip-types scripts/test-ai-integration.mjs', { stdio: 'inherit' });

console.log('\n=== Step 17/17: TypeScript & Production Build ===');
execSync('npm run build', { stdio: 'inherit' });

console.log('\n✓ ALL 17 VALIDATION SUITES PASSED CLEANLY.');
