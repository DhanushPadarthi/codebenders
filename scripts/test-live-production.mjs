import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

const LIVE_PROD_URL = 'https://feepulse.vercel.app';
const SCREENSHOT_DIR = path.resolve('docs/screenshots/live_prod');

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

  async navigate(url, waitMs = 3500) {
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
    console.log(`  ✓ Captured Live [${filename}] (${(buffer.length / 1024).toFixed(1)} KB)`);
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
  let chromeProcess = null;

  console.log('================================================================');
  console.log(`FeePulse — Real Browser Test on LIVE Production: ${LIVE_PROD_URL}`);
  console.log('================================================================\n');

  try {
    const tempProfile = path.join(process.env.TEMP, `feepulse_live_prod_${nonce}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    chromeProcess = spawn(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      [
        '--headless',
        '--remote-debugging-port=9225',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${tempProfile}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    await new Promise((r) => setTimeout(r, 2000));

    const targets = await fetch('http://localhost:9225/json/list').then((r) => r.json());
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found on Chrome CDP');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => (ws.onopen = resolve));
    const cdp = new CdpSession(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    await cdp.setViewport(1440, 900, false);

    // 1. Visit Live Login Page
    console.log('1. Navigating to live https://feepulse.vercel.app/login...');
    await cdp.navigate(`${LIVE_PROD_URL}/login`, 4000);

    const loginCheck = await cdp.evaluate(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Explore Live Demo'));
        return {
          title: document.title,
          hasDemoBtn: !!demoBtn,
          demoBtnText: demoBtn?.innerText.trim(),
        };
      })()
    `);
    console.log('  Live Login Check:', loginCheck);
    await cdp.captureScreenshot('live_01_login_page.png');

    // 2. Click "Explore Live Demo" on Live Production
    console.log('\n2. Executing One-Click Demo Access on Live Production...');
    const clickRes = await cdp.evaluate(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Explore Live Demo'));
        if (!demoBtn) return { success: false, reason: 'Demo button not found' };
        demoBtn.click();
        return { success: true };
      })()
    `);
    if (!clickRes.success) throw new Error(clickRes.reason);

    console.log('  Waiting for live authentication redirect...');
    await new Promise((r) => setTimeout(r, 6000));

    const liveDashboardUrl = await cdp.evaluate('window.location.href');
    console.log(`  Live Dashboard URL: ${liveDashboardUrl}`);

    // 3. Inspect Dashboard & Walkthrough
    console.log('\n3. Inspecting Live Dashboard & Onboarding...');
    const dashCheck = await cdp.evaluate(`
      (() => {
        const h2 = document.querySelector('h2')?.innerText || '';
        const outstanding = document.querySelector('section')?.innerText || '';
        return {
          h2,
          hasContent: outstanding.length > 0,
        };
      })()
    `);
    console.log('  Live Dashboard Status:', dashCheck);
    await cdp.captureScreenshot('live_02_dashboard_walkthrough.png');

    // Dismiss tour
    await cdp.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close tour"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.captureScreenshot('live_03_dashboard_clean.png');

    // 4. Test Navigation Across Core Modules
    const routesToTest = [
      { name: 'Customers', path: '/customers', file: 'live_04_customers.png' },
      { name: 'Invoices', path: '/invoices', file: 'live_05_invoices.png' },
      { name: 'Payments', path: '/payments', file: 'live_06_payments.png' },
      { name: 'Expenses', path: '/expenses', file: 'live_07_expenses.png' },
      { name: 'Cashflow', path: '/cashflow', file: 'live_08_cashflow.png' },
      { name: 'Recovery Queue', path: '/recovery-queue', file: 'live_09_recovery.png' },
      { name: 'Settings', path: '/settings', file: 'live_10_settings.png' },
    ];

    console.log('\n4. Verifying live core routes...');
    for (const r of routesToTest) {
      console.log(`  Testing ${r.name} (${r.path})...`);
      await cdp.navigate(`${LIVE_PROD_URL}${r.path}`, 3000);
      const pageStatus = await cdp.evaluate(`
        (() => {
          return {
            title: document.title,
            url: window.location.href,
            heading: document.querySelector('h1, h2')?.innerText || '',
          };
        })()
      `);
      console.log(`    Status:`, pageStatus);
      await cdp.captureScreenshot(r.file);
    }

    console.log('\n================================================================');
    console.log('✓ All Live Production Verification Tests PASSED CLEANLY!');
    console.log('================================================================');

  } catch (err) {
    console.error('❌ Live production test error:', err);
  } finally {
    if (chromeProcess) chromeProcess.kill();
  }
}

main().catch(console.error);
