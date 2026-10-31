import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const server = await createServer({
  configFile: 'apps/admin-web/vite.config.ts',
  server: { host: '127.0.0.1', port: 4197, strictPort: true }
});
await server.listen();

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true
});

const classes = [
  { id: 'class-1', code: 'XA', name: 'X A', grade_level: 10, student_count: 30 },
  { id: 'class-2', code: 'XB', name: 'X B', grade_level: 10, student_count: 28 }
];

const tokens = [
  { id: 'tok-1', role_code: 'GATE_STAFF', metadata: {}, created_at: '2026-10-31T10:00:00Z', revoked_at: null, token: 'fake_token_gate_1234567890abcdef' },
  { id: 'tok-2', role_code: 'LIBRARY_STAFF', metadata: {}, created_at: '2026-10-31T10:00:00Z', revoked_at: null, token: 'fake_token_library_1234567890abcdef' },
  { id: 'tok-3', role_code: 'TEACHER', metadata: {}, created_at: '2026-10-31T10:00:00Z', revoked_at: null, token: 'fake_token_teacher_1234567890abcdef' },
  { id: 'tok-4', role_code: 'PARENT', metadata: {}, created_at: '2026-10-31T10:00:00Z', revoked_at: null, token: 'fake_token_parent_1234567890abcdef' },
  { id: 'tok-5', role_code: 'WASTE_STAFF', metadata: { class_id: 'class-1' }, created_at: '2026-10-31T10:00:00Z', revoked_at: null, token: 'fake_token_waste_1234567890abcdef' }
];

const school = {
  id: 'school-test',
  code: 'SMAN3WTP',
  name: 'SMA Negeri 3 Watampone',
  timezone: 'Asia/Makassar',
  context: { school_id: 'school-test', membership_id: 'mem-1', roles: ['SCHOOL_ADMIN'], permissions: [] }
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('aksis-theme', 'light');
    sessionStorage.setItem('aksis.admin.session', JSON.stringify({ access_token: 'fixture', refresh_token: 'fixture' }));
    sessionStorage.setItem('aksis.admin.school', 'school-test');
  });

  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = new URL(req.url());
    const p = url.pathname;
    if (!p.startsWith('/api/v1/')) return req.continue();

    if (p.endsWith('/auth/session')) {
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { platform_admin: false, user: { email: 'admin@sman3wtp.aksis.co.id' } } }) });
    } else if (p.endsWith('/schools/current')) {
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: school }) });
    } else if (p.endsWith('/classes/summary')) {
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: classes }) });
    } else if (p.endsWith('/auth/qr')) {
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: tokens }) });
    } else {
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    }
  });

  await page.goto('http://127.0.0.1:4197/pwa-portals');
  await page.waitForSelector('.qr-grid');

  // Wait for attendance QR to render img
  await page.waitForSelector('#qr-attendance img');
  console.log('✓ Attendance QR rendered permanently');

  // Verify action buttons on card-attendance
  const attendanceActions = await page.$$eval('#actions-attendance button, #actions-attendance a', els => els.map(e => e.textContent.trim()));
  console.log('Attendance action buttons:', attendanceActions);
  assert.deepEqual(attendanceActions, ['🖨️ Cetak', '🔄 Ganti', '↗ Buka']);

  // Verify Library action buttons
  const libraryActions = await page.$$eval('#actions-library button, #actions-library a', els => els.map(e => e.textContent.trim()));
  assert.deepEqual(libraryActions, ['🖨️ Cetak', '🔄 Ganti', '↗ Buka']);

  // Verify Ekstrakurikuler action buttons
  const extraActions = await page.$$eval('#actions-extracurricular button, #actions-extracurricular a', els => els.map(e => e.textContent.trim()));
  assert.deepEqual(extraActions, ['🖨️ Cetak', '🔄 Ganti', '↗ Buka']);

  // Verify Parent action buttons
  const parentActions = await page.$$eval('#actions-parent button, #actions-parent a', els => els.map(e => e.textContent.trim()));
  assert.deepEqual(parentActions, ['🖨️ Cetak', '🔄 Ganti', '↗ Buka']);

  // Verify Bank Sampah dropdown behavior
  // Before selecting class-1:
  const wastePlaceholderBefore = await page.$eval('#qr-waste', el => el.textContent.trim());
  console.log('Waste card before select:', wastePlaceholderBefore);
  assert(wastePlaceholderBefore.includes('Pilih kelas'));

  // Select class-1 (which has an active token)
  await page.select('#scope-waste', 'class-1');
  await page.waitForSelector('#qr-waste img');
  console.log('✓ Waste QR rendered permanently after class selection');

  const wasteActions = await page.$$eval('#actions-waste button, #actions-waste a', els => els.map(e => e.textContent.trim()));
  console.log('Waste action buttons:', wasteActions);
  assert.deepEqual(wasteActions, ['🖨️ Cetak', '🔄 Ganti', '↗ Buka']);

  // Select class-2 (which has no token yet)
  await page.select('#scope-waste', 'class-2');
  await page.waitForFunction(() => document.querySelector('#generate-waste')?.style.display !== 'none');
  const wastePlaceholderClass2 = await page.$eval('#qr-waste', el => el.textContent.trim());
  console.log('Waste card for class without token:', wastePlaceholderClass2);
  assert(wastePlaceholderClass2.includes('Klik tombol di bawah untuk membuat QR akses'));

  // Switch back to class-1
  await page.select('#scope-waste', 'class-1');
  await page.waitForSelector('#qr-waste img');

  // Save screenshot
  await page.screenshot({ path: '/tmp/pwa-portals-permanent.png', fullPage: true });
  console.log('✓ Screenshot saved to /tmp/pwa-portals-permanent.png');
  console.log('ALL TESTS PASSED!');
} finally {
  await browser.close();
  await server.close();
}
