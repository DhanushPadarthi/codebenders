import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
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

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
const LOCAL_APP_URL = 'http://localhost:3000';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SCREENSHOT_DIR = path.resolve('docs/screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

console.log('================================================================');
console.log('FeePulse — Real-Browser Visual QA & Screenshot Pipeline');
console.log(`Server: ${LOCAL_APP_URL}`);
console.log('================================================================\n');

async function seedData(userId, userToken) {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });

  // 1. Business
  const { data: biz, error: errBiz } = await userClient
    .from('businesses')
    .insert({
      name: 'Apex Academy of Mathematics & Sciences',
      owner_id: userId,
      currency: 'INR',
    })
    .select()
    .single();
  if (errBiz) throw errBiz;
  const bizId = biz.id;

  // 2. Settings
  await userClient.from('business_settings').upsert({
    business_id: bizId,
    opening_cash_balance: 65000.0,
    default_payment_terms_days: 7,
    upi_id: 'apexacademy@okhdfcbank',
    invoice_prefix: 'INV-2026-',
    monthly_burn_target: 50000.0,
  });

  // 3. Customers
  const studentsData = [
    {
      name: 'Arjun Verma',
      parent_name: 'Rajesh Verma',
      phone: '+91 98765 43210',
      whatsapp_number: '+91 98765 43210',
      grade_subject: 'Class 10 - Mathematics',
      default_fee_amount: 8000.0,
      billing_cycle_day: 5,
      status: 'active',
    },
    {
      name: 'Priya Nair',
      parent_name: 'Suresh Nair',
      phone: '+91 98765 12345',
      whatsapp_number: '+91 98765 12345',
      grade_subject: 'Class 12 - Physics',
      default_fee_amount: 12000.0,
      billing_cycle_day: 10,
      status: 'active',
    },
    {
      name: 'Rohan Mehta',
      parent_name: 'Sunita Mehta',
      phone: '+91 98765 67890',
      whatsapp_number: '+91 98765 67890',
      grade_subject: 'Class 9 - Foundation Science',
      default_fee_amount: 6500.0,
      billing_cycle_day: 1,
      status: 'active',
    },
    {
      name: 'Ananya Iyer',
      parent_name: 'Venkatesh Iyer',
      phone: '+91 98765 24680',
      whatsapp_number: '+91 98765 24680',
      grade_subject: 'Class 11 - Calculus',
      default_fee_amount: 9500.0,
      billing_cycle_day: 15,
      status: 'active',
    },
    {
      name: 'Kavita Rao',
      parent_name: 'Deepak Rao',
      phone: '+91 98765 13579',
      whatsapp_number: '+91 98765 13579',
      grade_subject: 'Class 10 - Mathematics',
      default_fee_amount: 8000.0,
      billing_cycle_day: 5,
      status: 'archived',
    },
  ];

  const custMap = {};
  for (const s of studentsData) {
    const { data: c } = await userClient
      .from('customers')
      .insert({ ...s, business_id: bizId })
      .select()
      .single();
    custMap[s.name] = c.id;
  }

  // 4. Invoices
  const invoicesData = [
    {
      num: 'INV-2026-001',
      cust: 'Arjun Verma',
      issue: '2026-11-01',
      due: '2026-11-08',
      sub: 8000,
      paid: 0,
      status: 'overdue',
      item: 'Class 10 - Monthly Tuition Fee (Term 1)',
    },
    {
      num: 'INV-2026-002',
      cust: 'Priya Nair',
      issue: '2026-11-10',
      due: '2026-11-25',
      sub: 12000,
      paid: 0,
      status: 'sent',
      item: 'Class 12 - Physics Advanced Theory',
    },
    {
      num: 'INV-2026-003',
      cust: 'Rohan Mehta',
      issue: '2026-11-01',
      due: '2026-11-08',
      sub: 6500,
      paid: 0,
      status: 'sent',
      item: 'Class 9 - Science Foundation Batch',
    },
    {
      num: 'INV-2026-004',
      cust: 'Ananya Iyer',
      issue: '2026-11-15',
      due: '2026-11-24',
      sub: 9500,
      paid: 0,
      status: 'sent',
      item: 'Class 11 - Calculus & Trigonometry',
    },
    {
      num: 'INV-2026-005',
      cust: 'Arjun Verma',
      issue: '2026-11-22',
      due: '2026-11-29',
      sub: 3500,
      paid: 0,
      status: 'draft',
      item: 'Board Exam Test Series - Term 1',
    },
  ];

  const invMap = {};
  for (const inv of invoicesData) {
    const { data: i } = await userClient
      .from('invoices')
      .insert({
        business_id: bizId,
        customer_id: custMap[inv.cust],
        invoice_number: inv.num,
        issue_date: inv.issue,
        due_date: inv.due,
        subtotal: inv.sub,
        discount: 0,
        total_amount: inv.sub,
        amount_paid: inv.paid,
        status: inv.status,
      })
      .select()
      .single();
    invMap[inv.num] = i.id;

    await userClient.from('invoice_items').insert({
      business_id: bizId,
      invoice_id: i.id,
      description: inv.item,
      quantity: 1,
      unit_price: inv.sub,
      total_price: inv.sub,
    });
  }

  // 5. Payments (via atomic security RPC record_invoice_payment)
  const paymentsData = [
    {
      inv: 'INV-2026-001',
      amt: 5000,
      mode: 'upi',
      ref: 'UPI-ARJ-98214',
      date: '2026-11-05',
    },
    {
      inv: 'INV-2026-002',
      amt: 6000,
      mode: 'bank_transfer',
      ref: 'NEFT-PR-8812',
      date: '2026-11-12',
    },
    {
      inv: 'INV-2026-003',
      amt: 6500,
      mode: 'cash',
      ref: 'CASH-RM-1029',
      date: '2026-11-03',
    },
  ];

  for (const p of paymentsData) {
    const { error: pErr } = await userClient.rpc('record_invoice_payment', {
      p_invoice_id: invMap[p.inv],
      p_amount: p.amt,
      p_payment_mode: p.mode,
      p_payment_date: p.date,
      p_reference_id: p.ref,
    });
    if (pErr) console.error(`  [Payment RPC Error] ${p.inv}:`, pErr.message);
  }

  // 6. Bills
  const billsData = [
    {
      title: 'Coaching Centre Rent',
      vendor: 'Vasanth Properties',
      cat: 'rent',
      amt: 35000,
      due: '2026-11-26',
      status: 'unpaid',
      rec: true,
    },
    {
      title: 'Faculty Honorarium - Physics',
      vendor: 'Prof. S. K. Gupta',
      cat: 'salary',
      amt: 22000,
      due: '2026-12-01',
      status: 'unpaid',
      rec: true,
    },
    {
      title: 'Broadband & Power Bill',
      vendor: 'Airtel Broadband',
      cat: 'electricity',
      amt: 3800,
      due: '2026-11-20',
      status: 'overdue',
      rec: true,
    },
    {
      title: 'Term 1 Formula Handouts & Question Banks',
      vendor: 'City Stationery Works',
      cat: 'materials',
      amt: 4500,
      due: '2026-11-15',
      paid_date: '2026-11-15',
      status: 'paid',
      rec: false,
    },
  ];

  for (const b of billsData) {
    const { error: bErr } = await userClient.from('bills').insert({
      business_id: bizId,
      title: b.title,
      vendor_name: b.vendor,
      category: b.cat,
      amount: b.amt,
      due_date: b.due,
      paid_date: b.paid_date || null,
      status: b.status,
      is_recurring: b.rec,
      recurring_frequency: b.rec ? 'monthly' : null,
    });
    if (bErr) console.error(`  [Bill Insert Error] ${b.title}:`, bErr.message);
  }

  // 7. Payment Promises
  await userClient.from('payment_promises').insert([
    {
      business_id: bizId,
      customer_id: custMap['Arjun Verma'],
      invoice_id: invMap['INV-2026-001'],
      raw_message: 'Will pay remaining 3000 by 15th Nov after salary',
      promised_amount: 3000,
      promised_date: '2026-11-15',
      status: 'broken',
      confidence_score: 0.95,
    },
    {
      business_id: bizId,
      customer_id: custMap['Priya Nair'],
      invoice_id: invMap['INV-2026-002'],
      raw_message: 'Will send 6k today evening via GPay',
      promised_amount: 6000,
      promised_date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      confidence_score: 0.92,
    },
  ]);

  console.log(`✓ Seeded complete demo data for business: ${bizId}`);
  return { bizId, userClient };
}

// Simple CDP WebSocket Client
class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.msgId = 1;
    this.callbacks = new Map();

    this.ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: isMobile ? 2 : 1,
      mobile: isMobile,
    });
  }

  async navigate(url, waitMs = 3000) {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async captureScreenshot(filename) {
    try {
      await this.evaluate(`
        (() => {
          document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-overlay]').forEach(el => el.remove());
        })()
      `);
    } catch {}
    const snap = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const buffer = Buffer.from(snap.data, 'base64');
    const localPath = path.join(SCREENSHOT_DIR, filename);

    fs.writeFileSync(localPath, buffer);
    console.log(`  ✓ Captured [${filename}] (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }
}

async function run() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const qaEmail = `tutor-qa-${nonce}@feepulse.internal`;
  const qaPassword = `VisualQA!${nonce}2026#`;
  let userId = null;
  let chromeProcess = null;

  try {
    // 1. Create QA User
    console.log('Step 1: Provisioning demo QA user in Supabase...');
    const { data: signUpData, error: signUpErr } = await adminClient.auth.admin.createUser({
      email: qaEmail,
      password: qaPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Dr. Vikram Malhotra', business_name: 'Apex Academy' },
    });
    if (signUpErr) throw signUpErr;
    userId = signUpData.user.id;

    // Sign in via anon client to get session token
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: qaEmail,
      password: qaPassword,
    });
    if (loginErr) throw loginErr;
    const userToken = loginData.session.access_token;

    // 2. Seed realistic business data
    await seedData(userId, userToken);

    // 3. Launch Chrome with CDP
    console.log('\nStep 2: Launching headless Chrome with CDP on port 9222...');
    const tempProfile = path.join(process.env.TEMP, `feepulse_chrome_${nonce}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    chromeProcess = spawn(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      [
        '--headless',
        '--remote-debugging-port=9222',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${tempProfile}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    await new Promise((r) => setTimeout(r, 2000));

    // Connect to Chrome's default page target
    const targets = await fetch('http://localhost:9222/json/list').then((r) => r.json());
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found on Chrome CDP');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => (ws.onopen = resolve));
    const cdp = new CdpSession(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // 4. Log in via browser
    console.log('\nStep 3: Logging into FeePulse via /login...');
    await cdp.setViewport(1440, 900, false);
    await cdp.navigate(`${LOCAL_APP_URL}/login`, 2500);

    const loginRes = await cdp.evaluate(`
      (async () => {
        function setReactValue(input, val) {
          const proto = window.HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          desc.set.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const emailInput = document.querySelector('input[type="email"]');
        const passInput = document.querySelector('input[type="password"]');
        const submitBtn = document.querySelector('button[type="submit"]');
        if (!emailInput || !passInput || !submitBtn) return { error: 'Inputs not found' };

        setReactValue(emailInput, ${JSON.stringify(qaEmail)});
        setReactValue(passInput, ${JSON.stringify(qaPassword)});
        submitBtn.click();
        return { success: true };
      })()
    `);

    if (loginRes?.error) throw new Error(loginRes.error);
    console.log('  ✓ Submitted login form; waiting for auth redirect...');
    await new Promise((r) => setTimeout(r, 4000));

    const currentUrl = await cdp.evaluate('window.location.href');
    console.log(`  ✓ Current location after login: ${currentUrl}`);

    // 5. Desktop Screenshots (1440 x 900)
    console.log('\nStep 4: Capturing Desktop Viewports (1440x900)...');
    await cdp.setViewport(1440, 900, false);

    const desktopRoutes = [
      { name: '01_dashboard_desktop.png', path: '/' },
      { name: '02_customers_desktop.png', path: '/customers' },
      { name: '03_invoices_desktop.png', path: '/invoices' },
      { name: '04_payments_desktop.png', path: '/payments' },
      { name: '05_expenses_desktop.png', path: '/expenses' },
      { name: '06_cashflow_desktop.png', path: '/cashflow' },
      { name: '07_recovery_queue_desktop.png', path: '/recovery-queue' },
      { name: '08_ai_assistant_desktop.png', path: '/ai-assistant' },
      { name: '09_settings_desktop.png', path: '/settings' },
    ];

    for (const route of desktopRoutes) {
      await cdp.navigate(`${LOCAL_APP_URL}${route.path}`, 3000);
      await cdp.captureScreenshot(route.name);

      // If on invoices, open invoice detail drawer and printable fee slip
      if (route.path === '/invoices') {
        await cdp.evaluate(`
          (() => {
            const row = document.querySelector('tbody tr');
            if (row) row.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1200));
        await cdp.evaluate(`
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const printBtn = btns.find(b => b.textContent.includes('Print Slip'));
            if (printBtn) printBtn.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1200));
        await cdp.captureScreenshot('14_invoice_printable_slip.png');
      }

      // If on cashflow, also simulate Scenario B and capture
      if (route.path === '/cashflow') {
        await cdp.evaluate(`
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const scenB = btns.find(b => b.textContent.includes('Scenario B'));
            if (scenB) scenB.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1000));
        await cdp.captureScreenshot('11_scenario_simulator_active.png');
      }

      // If on payments, open receipt drawer and capture
      if (route.path === '/payments') {
        await cdp.evaluate(`
          (() => {
            const btn = document.querySelector('button[title="Print / View Receipt"]');
            if (btn) btn.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1000));
        await cdp.captureScreenshot('12_payment_receipt_modal.png');
      }
    }

    // 6. Mobile Screenshots (390 x 844, iPhone 14 size)
    console.log('\nStep 5: Capturing Mobile Viewport (390x844)...');
    await cdp.setViewport(390, 844, true);
    await cdp.navigate(`${LOCAL_APP_URL}/`, 3000);
    await cdp.captureScreenshot('10_dashboard_mobile.png');

    // Open mobile navigation drawer
    await cdp.evaluate(`
      (() => {
        const menuBtn = document.querySelector('button[aria-label="Open navigation menu"]');
        if (menuBtn) menuBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.captureScreenshot('13_mobile_navigation_drawer.png');

    console.log('\n================================================================');
    console.log('✓ Visual QA Screenshot Capture Successfully Completed!');
    console.log(`Output Directory: ${SCREENSHOT_DIR}`);
    console.log('================================================================');
  } finally {
    if (chromeProcess) {
      chromeProcess.kill('SIGKILL');
    }
    if (userId) {
      try {
        await adminClient.auth.admin.deleteUser(userId);
      } catch {
        // ignore
      }
    }
  }
}

run().catch((err) => {
  console.error('\nVisual QA run failed:', err);
  process.exit(1);
});
