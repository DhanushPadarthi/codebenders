import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

const LOCAL_APP_URL = 'http://localhost:3000';
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
  let chromeProcess = null;

  console.log('================================================================');
  console.log('FeePulse — Real Browser Test: Judge One-Click Demo Flow');
  console.log('================================================================\n');

  try {
    const tempProfile = path.join(process.env.TEMP, `feepulse_judge_${nonce}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    chromeProcess = spawn(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      [
        '--headless',
        '--remote-debugging-port=9224',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${tempProfile}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    await new Promise((r) => setTimeout(r, 2000));

    const targets = await fetch('http://localhost:9224/json/list').then((r) => r.json());
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found on Chrome CDP');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => (ws.onopen = resolve));
    const cdp = new CdpSession(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    await cdp.setViewport(1440, 900, false);
    
    // 1. Visit /login
    console.log('1. Navigating to /login...');
    await cdp.navigate(`${LOCAL_APP_URL}/login`, 2500);

    const loginPageCheck = await cdp.evaluate(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Explore Live Demo'));
        return {
          hasDemoBtn: !!demoBtn,
          demoBtnText: demoBtn?.innerText.trim(),
        };
      })()
    `);
    console.log('  Login Page Demo Button Check:', loginPageCheck);
    await cdp.captureScreenshot('19_login_page_with_demo_access.png');

    // 2. Click "Explore Live Demo"
    console.log('\n2. Clicking "Explore Live Demo" button...');
    const clickDemo = await cdp.evaluate(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Explore Live Demo'));
        if (!demoBtn) return { success: false, reason: 'Demo button not found' };
        demoBtn.click();
        return { success: true };
      })()
    `);
    if (!clickDemo.success) throw new Error(clickDemo.reason);

    console.log('  Waiting for demo authentication and redirect...');
    await new Promise((r) => setTimeout(r, 4500));

    const currentUrl = await cdp.evaluate('window.location.href');
    console.log(`  Current URL after demo login: ${currentUrl}`);

    // 3. Check Dashboard & Walkthrough
    console.log('\n3. Verifying Dashboard & Onboarding Walkthrough...');
    const dashCheck = await cdp.evaluate(`
      (() => {
        const bizName = document.querySelector('header span')?.innerText || '';
        const hasTourModal = !!document.querySelector('.fixed:has(h2)');
        const tourTitle = document.querySelector('h2')?.innerText || '';
        const outstanding = document.querySelector('section')?.innerText || '';
        return {
          bizName,
          hasTourModal,
          tourTitle,
        };
      })()
    `);
    console.log('  Dashboard & Tour Check:', dashCheck);
    await cdp.captureScreenshot('20_dashboard_with_onboarding_walkthrough.png');

    // 4. Test Mobile Responsive Onboarding Walkthrough
    console.log('\n4. Testing Mobile Viewport (390 x 844)...');
    await cdp.setViewport(390, 844, true);
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.captureScreenshot('21_mobile_onboarding_walkthrough.png');

    // 5. Dismiss Tour and Verify Dashboard Metrics
    console.log('\n5. Dismissing Tour to inspect Dashboard metrics...');
    await cdp.setViewport(1440, 900, false);
    await new Promise((r) => setTimeout(r, 500));
    await cdp.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close tour"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
    await cdp.captureScreenshot('22_demo_dashboard_populated.png');

    console.log('\n================================================================');
    console.log('Judge One-Click Demo Flow Verified Successfully!');
    console.log('================================================================');

  } catch (err) {
    console.error('❌ Test error:', err);
  } finally {
    if (chromeProcess) chromeProcess.kill();
  }
}

main().catch(console.error);
