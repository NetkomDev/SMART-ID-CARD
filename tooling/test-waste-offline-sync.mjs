import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.AKSIS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const base = process.env.AKSIS_WASTE_URL ?? 'http://127.0.0.1:4175/';
const school = {
  id: 'portal-waste-01',
  school_id: 'school-test-01',
  school_name: 'SMA Negeri 3 Watampone',
  role_code: 'WASTE_STAFF',
  metadata: { class_id: 'class-x2' }
};

const classStudents = [
  {
    id: 'student-01',
    full_name: 'Ahmad Faiz Fadhlullah',
    student_number: '20260101',
    nisn: '0081234567',
    class_name: 'X-2',
    photo_url: null,
    cards: [{ qr_key: 'CARD-QR-FAIZ-01', card_uid: 'UID-FAIZ-01', card_serial: 'SR-01' }]
  },
  {
    id: 'student-02',
    full_name: 'Siti Sarah Humairah',
    student_number: '20260102',
    nisn: '0087654321',
    class_name: 'X-2',
    photo_url: null,
    cards: [{ qr_key: 'CARD-QR-SARAH-02', card_uid: 'UID-SARAH-02', card_serial: 'SR-02' }]
  }
];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  const errors = [];
  const networkRequests = [];
  const postedDeposits = [];
  let simulateOffline = false;
  let rosterFetched = false;

  page.on('pageerror', err => console.error('BROWSER PAGE ERROR:', err));
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  await page.setRequestInterception(true);

  page.on('request', async req => {
    const url = new URL(req.url());
    if (!url.pathname.startsWith('/api/v1/')) return req.continue();

    const path = url.pathname.slice(7);
    networkRequests.push({ method: req.method(), path });

    if (simulateOffline) {
      return req.abort('failed');
    }

    if (path === '/auth/qr/login' || path === '/auth/qr/context') {
      const body = path.endsWith('/login')
        ? { session: { access_token: 'valid-token', refresh_token: 'valid-refresh' }, portal: school }
        : school;
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) });
    }

    if (path === '/classes/class-x2') {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { name: 'X-2' } }) });
    }

    if (path.startsWith('/students/portal-roster')) {
      rosterFetched = true;
      return req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            school_id: 'school-test-01',
            students: classStudents,
            next_cursor: null
          }
        })
      });
    }

    if (path.startsWith('/waste/dashboard')) {
      return req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            school_id: 'school-test-01',
            period: 'month',
            timezone: 'Asia/Makassar',
            as_of: new Date().toISOString(),
            rates: { organic: 5, inorganic: 8 },
            today: { students: 0, total_kg: 0, points: 0, transactions: 0, unscored: 0 },
            classes: [{ class_id: 'class-x2', class_name: 'X-2', total_kg: 0, student_count: 0 }],
            top_students: [],
            bottom_students: []
          }
        })
      });
    }

    if (path === '/waste/transactions' && req.method() === 'POST') {
      const payload = JSON.parse(req.postData());
      postedDeposits.push(payload);
      return req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 'trans-' + Date.now(), total_kg: payload.total_kg, points_earned: 10 }
        })
      });
    }

    return req.respond({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Not found' } }) });
  });

  console.log('1. Membuka PWA Piket Sampah dengan token QR portal...');
  await page.goto(base + '#token=' + 'f'.repeat(64));
  await page.waitForSelector('#view-scan', { visible: true });

  // Verify initial class roster was fetched silently
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('aksis_student_cache_waste:school-test-01:portal-waste-01');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.students) && parsed.students.length === 2;
    } catch {
      return false;
    }
  }, { timeout: 5000 });

  assert.ok(rosterFetched, 'Roster kelas piket sampah harus diambil otomatis saat inisialisasi portal');
  console.log('✓ Singkronisasi awal roster kelas piket berhasil tersimpan di cache lokal HP');

  // Verify UI is not displaying any errors or blocking spinners
  assert.equal(await page.$eval('#scan-error', el => el.style.display), 'none');
  assert.equal(await page.$eval('#loading-overlay', el => el.style.display), 'none');

  console.log('2. Menguji mode offline (mati lampu / internet padam)...');
  simulateOffline = true;
  await page.setOfflineMode(true);

  // Scan student 1 via QR key while completely offline
  const startTime = Date.now();
  await page.focus('#scan-input');
  await page.$eval('#scan-input', el => { el.value = 'CARD-QR-FAIZ-01'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const inputState = await page.$eval('#scan-input', el => ({ value: el.value, disabled: el.disabled, validity: el.validity.valid }));
  console.log('INPUT STATE:', inputState);
  await page.$eval('#form-scan', f => f.requestSubmit());
  await page.waitForSelector('#view-input', { visible: true });
  const resolveDuration = Date.now() - startTime;

  assert.ok(resolveDuration < 2500, `Resolusi offline harus instan (<2500ms termasuk render DOM), terukur: ${resolveDuration}ms`);
  assert.equal(await page.$eval('#input-student-name', el => el.textContent), 'Ahmad Faiz Fadhlullah');
  console.log(`✓ Resolusi offline kartu siswa di HP berhasil (<${resolveDuration}ms) tanpa koneksi internet`);

  // Submit waste deposit in offline mode
  await page.$eval('#weight-input', el => { el.value = '1.750'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#form-input', f => f.requestSubmit());

  // Verify deposit is immediately confirmed and user returns to scanner
  await page.waitForSelector('#view-scan', { visible: true });
  const scanStatus = await page.$eval('#scan-status', el => el.textContent);
  assert.ok(scanStatus.includes('Setoran tersimpan di HP'), 'Piket harus langsung siap memindai siswa berikutnya');
  console.log('✓ Setoran sampah tersimpan di IndexedDB HP secara offline & UI langsung siap memindai siswa berikutnya');

  // Verify pending items in IndexedDB
  const pendingCount = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('aksis-pwa-events-v1', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const store = tx.objectStore('events');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.length);
      req.onerror = () => reject(req.error);
    });
  });

  assert.equal(pendingCount, 1, 'Harus ada 1 transaksi setoran yang menunggu sinkronisasi di IndexedDB');

  console.log('3. Menguji pemulihan koneksi internet (online)...');
  simulateOffline = false;
  await page.setOfflineMode(false);

  // Trigger online event on page
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // Wait for background sync to silently flush the queue without clicking any buttons
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('aksis-pwa-events-v1', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const store = tx.objectStore('events');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.length === 0);
      req.onerror = () => reject(req.error);
    });
  }, { timeout: 10000 });

  assert.equal(postedDeposits.length, 1, 'Setoran offline harus otomatis terkirim ke server');
  assert.equal(postedDeposits[0].student_id, 'student-01');
  assert.equal(postedDeposits[0].organic_kg, 1.75);
  console.log('✓ Setoran offline berhasil tersinkronisasi otomatis ke server secara senyap tanpa intervensi user');

  // Verify no error banners appeared on the scanner UI
  assert.equal(await page.$eval('#scan-error', el => el.style.display), 'none');
  assert.deepEqual(errors, []);

  console.log('SEMUA PENGUJIAN OFFLINE & SENYAP SINKRONISASI PIKET SAMPAH LULUS (100% PASS)!');
} finally {
  await browser.close();
}
