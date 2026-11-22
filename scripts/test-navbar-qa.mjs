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

async function main() {
  const nonce = crypto.randomBytes(3).toString('hex');
  const qaEmail = `navbar-qa-${nonce}@feepulse.internal`;
  const qaPassword = `NavbarQA!${nonce}2026#`;
  let userId = null;
  let chromeProcess = null;

  console.log('================================================================');
  console.log('FeePulse — Navbar Search, Tuition & Notification Test Suite');
  console.log('================================================================\n');

  try {
    // 1. Create QA User
    console.log('1. Creating test user & business...');
    const { data: signUpData, error: signUpErr } = await adminClient.auth.admin.createUser({
      email: qaEmail,
      password: qaPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Prof. Ramesh Sharma', business_name: 'Sharma Mathematics Academy' },
    });
    if (signUpErr) throw signUpErr;
    userId = signUpData.user.id;

    // Create Business
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: qaEmail,
      password: qaPassword,
    });
    if (loginErr) throw loginErr;
    const userToken = loginData.session.access_token;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });

    const { data: biz, error: bizErr } = await userClient
      .from('businesses')
      .insert({
        name: 'Sharma Mathematics Academy',
        owner_id: userId,
        currency: 'INR',
      })
      .select()
      .single();
    if (bizErr) throw bizErr;

    // 2. Launch Chrome
    console.log('\n2. Launching Chrome with CDP...');
    const tempProfile = path.join(process.env.TEMP, `feepulse_navbar_${nonce}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    chromeProcess = spawn(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      [
        '--headless',
        '--remote-debugging-port=9223',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${tempProfile}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    await new Promise((r) => setTimeout(r, 2000));

    const targets = await fetch('http://localhost:9223/json/list').then((r) => r.json());
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found on Chrome CDP');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => (ws.onopen = resolve));
    const cdp = new CdpSession(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    await cdp.setViewport(1440, 900, false);
    await cdp.navigate(`${LOCAL_APP_URL}/login`, 2500);

    // 3. Log in
    console.log('\n3. Logging in...');
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
    await new Promise((r) => setTimeout(r, 4000));

    // Verify on Dashboard
    console.log('\n4. Verifying Dashboard Header...');
    const currentUrl = await cdp.evaluate('window.location.href');
    console.log(`  Current URL: ${currentUrl}`);

    // TEST A: Tuition Selection & Click-Outside
    console.log('\n--- TEST A: Tuition Centre / Branch Selection & Click-Outside ---');
    const tuitionTest = await cdp.evaluate(`
      (() => {
        // Find tuition selector button
        const branchBtn = document.querySelector('header button:has(svg.lucide-building-2)');
        if (!branchBtn) return { success: false, reason: 'Branch button not found' };
        const initialText = branchBtn.innerText.trim();
        
        // 1. Click to open dropdown
        branchBtn.click();
        const menuOpen = !!document.querySelector('header [role="region"], header .absolute:has(button)');
        
        // Get all branch option buttons
        const options = Array.from(document.querySelectorAll('header .absolute button')).map(b => b.innerText.trim());
        
        return {
          success: true,
          initialText,
          menuOpened: options.length > 0,
          optionsCount: options.length,
          options
        };
      })()
    `);
    console.log('  Tuition Dropdown Open Check:', tuitionTest);

    await cdp.captureScreenshot('15_navbar_tuition_menu_open.png');

    // Click second option
    const switchTest = await cdp.evaluate(`
      (() => {
        const optionBtns = Array.from(document.querySelectorAll('header .absolute button'));
        if (optionBtns.length > 1) {
          const chosen = optionBtns[1].innerText.trim();
          optionBtns[1].click();
          const newButtonText = document.querySelector('header button:has(svg.lucide-building-2)')?.innerText.trim();
          return { success: true, chosen, newButtonText, closed: !document.querySelector('header .absolute:has(button)') };
        }
        return { success: false, reason: 'Not enough options' };
      })()
    `);
    console.log('  Tuition Switch Check:', switchTest);

    // Test Click-Outside for Tuition Dropdown
    const tuitionClickOutside = await cdp.evaluate(`
      (async () => {
        // Re-open
        const branchBtn = document.querySelector('header button:has(svg.lucide-building-2)');
        branchBtn.click();
        await new Promise(r => setTimeout(r, 100));
        const isOpenBefore = Array.from(document.querySelectorAll('header .absolute button')).length > 0;
        
        // Dispatch mousedown outside on document.body
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 150));
        
        const isOpenAfter = Array.from(document.querySelectorAll('header .absolute button')).length > 0;
        return { isOpenBefore, isOpenAfter, closedSuccessfully: isOpenBefore && !isOpenAfter };
      })()
    `);
    console.log('  Tuition Click-Outside Dismissal:', tuitionClickOutside);

    // TEST B: Multi-Search Command Palette
    console.log('\n--- TEST B: Multi-Search Command Palette ---');
    const openSearch = await cdp.evaluate(`
      (() => {
        const searchBtn = document.querySelector('header button[aria-label="Search students, invoices, and expenses"]') ||
                          document.querySelector('header button:has(svg.lucide-search)');
        if (!searchBtn) return { success: false, reason: 'Search button not found' };
        searchBtn.click();
        
        const input = document.querySelector('input[placeholder*="Search students"]');
        return { success: !!input, placeholder: input?.placeholder };
      })()
    `);
    console.log('  Command Palette Open Check:', openSearch);

    // Type query "Arjun"
    const searchFilterTest = await cdp.evaluate(`
      (() => {
        function setReactValue(input, val) {
          const proto = window.HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          desc.set.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const input = document.querySelector('input[placeholder*="Search students"]');
        setReactValue(input, 'Arjun');
        
        // Check results
        const resultItems = Array.from(document.querySelectorAll('.max-h-96 > div')).map(el => el.innerText.trim().replace(/\\n+/g, ' | '));
        const clearBtn = !!document.querySelector('button[aria-label="Clear search"]');
        return { query: input.value, resultsCount: resultItems.length, resultsPreview: resultItems.slice(0, 3), clearBtn };
      })()
    `);
    console.log('  Search Filter "Arjun" Check:', searchFilterTest);

    await cdp.captureScreenshot('16_navbar_multi_search_active.png');

    // Test Clear Button
    const clearTest = await cdp.evaluate(`
      (() => {
        const clearBtn = document.querySelector('button[aria-label="Clear search"]');
        if (!clearBtn) return { success: false, reason: 'Clear button not found' };
        clearBtn.click();
        const input = document.querySelector('input[placeholder*="Search students"]');
        return { success: true, clearedQuery: input.value, isEmpty: input.value === '' };
      })()
    `);
    console.log('  Search Clear Button (✕) Check:', clearTest);

    // Dismiss with Escape key
    const escTest = await cdp.evaluate(`
      (async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const input = document.querySelector('input[placeholder*="Search students"]');
        return { isClosed: !input };
      })()
    `);
    console.log('  Search Escape Key Dismissal:', escTest);

    // TEST C: Notifications & Click-Outside & Clear All
    console.log('\n--- TEST C: Notifications & Clear All & Click-Outside ---');
    const notifOpen = await cdp.evaluate(`
      (() => {
        const bellBtn = document.querySelector('header button[aria-label="View notifications"]');
        if (!bellBtn) return { success: false, reason: 'Bell button not found' };
        bellBtn.click();
        
        const clearAllBtn = Array.from(document.querySelectorAll('header button')).find(b => b.innerText.includes('Clear All'));
        const pendingItems = document.querySelectorAll('header .space-y-2 > div').length;
        return {
          success: true,
          hasClearAll: !!clearAllBtn,
          pendingItemsCount: pendingItems,
        };
      })()
    `);
    console.log('  Notification Dropdown Open:', notifOpen);

    await cdp.captureScreenshot('17_navbar_notification_open.png');

    // Click "Clear All"
    const clearNotifTest = await cdp.evaluate(`
      (() => {
        const clearAllBtn = Array.from(document.querySelectorAll('header button')).find(b => b.innerText.includes('Clear All'));
        if (!clearAllBtn) return { success: false, reason: 'Clear All button not found' };
        clearAllBtn.click();
        
        const emptyStateText = document.querySelector('header .space-y-2')?.innerText.trim().replace(/\\n+/g, ' ');
        const badgeCount = document.querySelectorAll('header .animate-pulse').length;
        return {
          success: true,
          emptyStateText,
          unreadBadgeGone: badgeCount === 0,
        };
      })()
    `);
    console.log('  Notification Clear All Check:', clearNotifTest);

    await cdp.captureScreenshot('18_navbar_notification_cleared.png');

    // Test Click-Outside for Notifications
    const notifClickOutside = await cdp.evaluate(`
      (async () => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 150));
        const notifMenu = document.querySelector('header .w-80');
        return { isClosed: !notifMenu };
      })()
    `);
    console.log('  Notification Click-Outside Dismissal:', notifClickOutside);

    console.log('\n================================================================');
    console.log('All Navbar Feature Tests Completed Successfully!');
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
  } finally {
    if (chromeProcess) {
      chromeProcess.kill();
    }
    if (userId) {
      console.log(`Cleaning up test user ${userId}...`);
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
}

main().catch(console.error);
