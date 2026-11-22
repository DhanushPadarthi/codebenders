import fs from 'fs';

const files = [
  'supabase/migrations/20261121000001_core_schema.sql',
  'supabase/migrations/20261121000002_functions_triggers.sql',
  'supabase/migrations/20261121000003_rls_policies.sql',
  'supabase/migrations/20261122000006_promise_fulfilment_and_scenario_archival.sql',
  'supabase/migrations/20261122000007_ai_usage_quotas_and_rate_limits.sql'
];

let hasError = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Check parenthesis balance
  let openParen = 0;
  let inString = false;
  let strChar = '';
  let inDollarBlock = false;
  let dollarTag = '';

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : '';

    // Handle dollar quoting $$ or $tag$
    if (ch === '$') {
      const match = content.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        const tag = match[1];
        if (!inDollarBlock) {
          inDollarBlock = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollarBlock = false;
          dollarTag = '';
        }
        i += tag.length - 1;
        continue;
      }
    }

    if (inDollarBlock) continue;

    // Single quote string literals
    if (ch === "'" && prev !== '\\') {
      if (!inString) {
        inString = true;
        strChar = "'";
      } else if (strChar === "'") {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (ch === '(') openParen++;
    if (ch === ')') openParen--;
  }

  if (openParen !== 0) {
    console.error(`✗ ${file}: Parentheses imbalance detected (count: ${openParen})`);
    hasError = true;
  } else {
    console.log(`✓ ${file}: Syntax balance and structural check passed`);
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`✓ All ${files.length} SQL migration files passed structural syntax validation.`);
}
