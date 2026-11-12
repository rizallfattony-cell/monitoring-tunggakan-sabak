const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const qa = path.resolve(root, '..', '..', 'qa-public-receipt');
fs.mkdirSync(qa, { recursive: true });
const rows = Array.from({ length: 3 }, (_, i) => ({
  idpel: `14390000000${i + 1}`, nama: `Pelanggan ${i + 1}`, tarif: 'R1', daya: '900',
  rptag: 359152 + i, admin_fee: 5000, stand_awal: '100', stand_akhir: '120',
  billing_periods: ['202610'], nama_toko: 'PLN MOBILE', alamat_toko: 'PLN ULP SABAK',
}));

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, `.${pathname === '/' ? '/cetak-struk.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, body) => {
      res.writeHead(error ? 404 : 200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
      res.end(error ? 'not found' : body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => { window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; }; });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.jsdelivr.net') {
        if (url.pathname.includes('supabase')) return route.fulfill({ body: `
          window.__mockUser = null;
          window.supabase = { createClient: () => ({
            auth: {
              getUser: async () => ({ data: { user: window.__mockUser }, error: null }),
              signInWithPassword: async ({ email }) => { window.__mockUser = { id: email.startsWith('admin') ? 'admin' : email.startsWith('operator') ? 'receipt_operator' : 'petugas', email }; return { error: null }; },
              signOut: async () => { window.__mockUser = null; window.__authCallback?.('SIGNED_OUT'); },
              onAuthStateChange: (callback) => { window.__authCallback = callback; },
            },
            rpc: async (name, args) => ({ data: name === 'lookup_receipt_operator_customers' ? ${JSON.stringify(rows)}.filter(row => args.p_idpels.includes(row.idpel)) : [], error: null }),
            from: (table) => {
              window.__tableCalls = [...(window.__tableCalls || []), table];
              const filters = {};
              const result = () => {
                if (table === 'monitoring_profiles') return { data: window.__mockUser.id === 'receipt_operator' ? null : { role: window.__mockUser.id, petugas: window.__mockUser.id === 'petugas' ? 'ADRI' : null, email: window.__mockUser.email }, error: null };
                if (table === 'monitoring_receipt_operators') return { data: window.__mockUser.id === 'receipt_operator' ? { user_id: window.__mockUser.id, email: window.__mockUser.email } : null, error: null };
                if (table === 'monitoring_receipt_settings') return { data: { admin_fee: 5000, nama_toko: 'PLN MOBILE', alamat_toko: 'PLN ULP SABAK' }, error: null };
                if (table === 'monitoring_receipt_meters') return { data: (filters.idpel || []).map(idpel => ({ idpel, stand_awal: '100', stand_akhir: '120' })), error: null };
                if (table === 'monitoring_remaining_customers') return { data: ${JSON.stringify(rows)}.filter(row => (filters.idpel || []).includes(row.idpel) && (window.__mockUser.id === 'admin' || row.idpel === '143900000001')), error: null };
                return { data: [], error: null };
              };
              return { select() { return this; }, eq() { return this; }, in(key, values) { filters[key] = values; return this; }, maybeSingle() { return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
            },
          }) };`, contentType: 'text/javascript' });
        return route.fulfill({ body: 'window.lucide={createIcons(){}};', contentType: 'text/javascript' });
      }
      if (url.hostname === '127.0.0.1') return route.continue();
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/cetak-struk.html`);
    await page.waitForFunction(() => document.querySelector('#authStatus').textContent.includes('Masuk dengan akun'));
    assert.equal(await page.locator('#receiptWorkspace').isHidden(), true);
    await page.locator('#loginEmail').fill('admin@simontok.test');
    await page.locator('#loginPassword').fill('password');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#receiptWorkspace').hidden);
    await page.locator('#logoFile').setInputFiles({
      name: 'logo.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lfsAAAAASUVORK5CYII=', 'base64'),
    });
    await page.waitForFunction(() => !document.querySelector('#logoPreview').hidden);
    await page.locator('#singleIdpel').fill('143900000001');
    await page.locator('#singleMode button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#results').hidden);
    assert.match(await page.locator('#resultRows').innerText(), /Rp\s*364\.152/);
    assert.equal(await page.locator('#resultRows tr').count(), 1);
    await page.locator('[data-preview="143900000001"]').click();
    assert.match(await page.locator('#previewContent').innerText(), /STRUK PEMBAYARAN TAGIHAN\s+LISTRIK/);
    assert.match(await page.locator('#previewContent').innerText(), /STRUK INI SEBAGAI BUKTI YANG SAH/);
    assert.match(await page.locator('#previewContent').innerText(), /MOHON DI SIMPAN/);
    assert.match(await page.locator('#previewContent').innerText(), /DOWNLOAD PLN MOBILE/);
    assert.equal(await page.locator('#previewContent .receipt-row dt').first().evaluate((item) => getComputedStyle(item, '::after').content), '":"');
    assert.equal(await page.locator('#previewContent .receipt-logo').count(), 1);
    await page.locator('#printPreview').click();
    assert.equal(await page.evaluate(() => window.__printCalls), 1);
    assert.equal(await page.locator('.print-sheet').count(), 1);
    assert.equal(await page.locator('.print-sheet .receipt-logo').count(), 1);
    await page.locator('#closePreview').click();

    await page.locator('#bulkTab').click();
    await page.locator('#bulkIdpels').fill('143900000001\n143900000002\n143900000003\n143900000004');
    await page.locator('#bulkMode button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#resultRows tr').length === 3);
    assert.match(await page.locator('#missingIds').innerText(), /143900000004/);
    await page.locator('#printSelected').click();
    assert.equal(await page.locator('.print-sheet').count(), 2);
    assert.equal(await page.evaluate(() => window.__printCalls), 2);
    await page.emulateMedia({ media: 'print' });
    const printSizes = await page.locator('.receipt').evaluateAll((items) => items.map((item) => ({
      scrollHeight: item.scrollHeight, clientHeight: item.clientHeight,
      fontSize: getComputedStyle(item).fontSize, padding: getComputedStyle(item).padding,
      head: item.querySelector('.receipt-head')?.getBoundingClientRect().height,
      details: item.querySelector('.receipt-details')?.getBoundingClientRect().height,
      attestation: item.querySelector('.receipt-attestation')?.getBoundingClientRect().height,
      foot: item.querySelector('.receipt-foot')?.getBoundingClientRect().height,
      contentBottom: item.querySelector('.receipt-foot') ? item.querySelector('.receipt-foot').getBoundingClientRect().bottom - item.getBoundingClientRect().top : 0,
    })));
    assert.equal(printSizes.filter((item) => item.clientHeight > 0).every((item) => item.contentBottom <= item.clientHeight + 1), true, `Receipt content must fit within each half-page: ${JSON.stringify(printSizes)}`);
    await page.pdf({ path: path.join(qa, 'receipt-collective-a4.pdf'), printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: 'screen' });
    await page.screenshot({ path: path.join(qa, 'receipt-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(qa, 'receipt-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile page has no horizontal overflow');
    await page.locator('#logoutButton').click();
    await page.waitForFunction(() => document.querySelector('#receiptWorkspace').hidden);
    await page.locator('#loginEmail').fill('petugas@simontok.test');
    await page.locator('#loginPassword').fill('password');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#receiptWorkspace').hidden);
    await page.locator('#singleIdpel').fill('143900000002');
    await page.locator('#singleMode button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#results').hidden);
    assert.equal(await page.locator('#resultRows tr').count(), 0, 'Petugas cannot see another petugas customer');
    await page.locator('#logoutButton').click();
    await page.waitForFunction(() => document.querySelector('#receiptWorkspace').hidden);
    await page.locator('#loginEmail').fill('operator@simontok.test');
    await page.locator('#loginPassword').fill('password');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#receiptWorkspace').hidden);
    assert.equal(await page.locator('#dashboardLink').isHidden(), true);
    const tableCallsBefore = await page.evaluate(() => window.__tableCalls.length);
    await page.locator('#singleIdpel').fill('143900000003');
    await page.locator('#singleMode button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#resultRows tr').length === 1);
    assert.match(await page.locator('#resultRows').innerText(), /143900000003/);
    assert.equal(await page.evaluate((before) => window.__tableCalls.length, tableCallsBefore), tableCallsBefore, 'Operator must use RPC, not direct table reads');
    assert.deepEqual(errors, []);
    console.log('PASS authenticated receipt UI: admin, petugas, operator, A4 sheets and mobile');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
