import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const server = await createServer({
  configFile: 'apps/attendance-pwa/vite.config.ts',
  server: { host: '127.0.0.1', port: 4198, strictPort: true }
});
await server.listen();

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true
});

let registeredDevice = null;

try {
  const page = await browser.newPage();
  let nativePromptCalled = false;
  let installModalShown = false;
  page.on('pageerror', e => console.error('PAGE ERROR:', e));
  page.on('console', msg => {
    const text = msg.text();
    console.log('PAGE CONSOLE:', text);
    if (text.includes('Triggering native install prompt')) {
      nativePromptCalled = true;
    }
    if (text.includes('Showing install modal dialog')) {
      installModalShown = true;
    }
  });
  await page.setViewport({ width: 390, height: 844 }); // iPhone / mobile viewport

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('aksis.portal.GATE_STAFF.v1', JSON.stringify({
      session: { access_token: 'fake_token', refresh_token: 'fake_refresh' },
      portal: {
        id: 'token-gate-1',
        school_id: 'school-1',
        school_name: 'SMA Negeri 3 Watampone',
        role_code: 'GATE_STAFF',
        metadata: {}
      }
    }));
  });

  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = new URL(req.url());
    const p = url.pathname;

    if (p.endsWith('/attendance/bootstrap')) {
      await req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            students: [],
            rules: {
              timezone: 'Asia/Makassar',
              check_in_start: '06:30',
              check_in_end: '07:30',
              check_out_start: '14:30'
            },
            server_time: new Date().toISOString(),
            today: {}
          }
        })
      });
    } else if (p.endsWith('/auth/qr/context')) {
      await req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'token-gate-1',
            school_id: 'school-1',
            school_name: 'SMA Negeri 3 Watampone',
            role_code: 'GATE_STAFF',
            metadata: {}
          }
        })
      });
    } else if (p.endsWith('/attendance/register-device')) {
      registeredDevice = JSON.parse(req.postData());
      await req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { bound: true, ...registeredDevice } })
      });
    } else if (p.startsWith('/api/v1/')) {
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
    } else {
      req.continue();
    }
  });

  await page.goto('http://127.0.0.1:4198/');

  // Wait for modal-scanner-name to be displayed
  await page.waitForFunction(() => {
    const m = document.getElementById('modal-scanner-name');
    return m && getComputedStyle(m).display === 'flex';
  });

  // Verify button text is "Simpan & Install"
  const buttonText = await page.$eval('#btn-submit-scanner-name', el => el.textContent.trim());
  console.log('Button text:', buttonText);
  assert.equal(buttonText, 'Simpan & Install');

  // Input name
  await page.type('#input-scanner-name', 'Pak Budi (Guru Piket)');

  // Click Simpan & Install
  await page.click('#btn-submit-scanner-name');

  // Wait for modal-scanner-name to close
  await page.waitForFunction(() => {
    const m = document.getElementById('modal-scanner-name');
    return m && getComputedStyle(m).display === 'none';
  });
  console.log('✓ Scanner name modal closed');

  // Check that teacher name badge appears in UI
  const badgeName = await page.$eval('#scanner-name-display', el => el.textContent.trim());
  console.log('Badge name:', badgeName);
  assert.equal(badgeName, 'Pak Budi (Guru Piket)');

  // Wait for install trigger (either native prompt called or dialog rendered)
  await new Promise(r => setTimeout(r, 600));
  const dialogExists = (await page.$('#aksis-install')) !== null;
  console.log('Install prompt status: nativePromptCalled =', nativePromptCalled, ', installModalShown =', installModalShown, ', dialogExists =', dialogExists);
  assert(nativePromptCalled || installModalShown || dialogExists, 'PWA install was offered/prompted to user');

  // Check background device registration
  console.log('Registered device in backend:', registeredDevice);
  assert(registeredDevice !== null, 'Device registration was sent to backend');
  assert.equal(registeredDevice.scanner_name, 'Pak Budi (Guru Piket)');
  assert(registeredDevice.device_id.length > 10, 'Valid device_id');

  // Take screenshot
  await page.screenshot({ path: '/tmp/attendance-install-prompt.png', fullPage: true });
  console.log('✓ Screenshot saved to /tmp/attendance-install-prompt.png');

  console.log('ALL ATTENDANCE INSTALL PROMPT TESTS PASSED!');
} finally {
  await browser.close();
  await server.close();
}
