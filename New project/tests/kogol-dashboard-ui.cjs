const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const qa = path.resolve(process.env.KOGOL_DASHBOARD_QA || path.join(root, '..', '..', 'qa-kogol-dashboard'));
const assets = path.resolve(root, '..', '..', 'qa-receipt-history-1.7.4');
fs.mkdirSync(qa, { recursive: true });

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, body) => {
      res.writeHead(error ? 404 : 200, {
        'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream',
      });
      res.end(error ? 'not found' : body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/app.js')) {
        const body = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace('\nboot();', '\nwindow.__kogolReady = true;');
        return route.fulfill({ body, contentType: 'text/javascript' });
      }
      if (url.hostname === 'cdn.jsdelivr.net') {
        if (url.pathname.includes('supabase')) return route.fulfill({ body: 'window.supabase={};', contentType: 'text/javascript' });
        const name = url.pathname.includes('xlsx') ? 'xlsx.full.min.js' : url.pathname.includes('lucide') ? 'lucide.min.js' : null;
        return route.fulfill({ body: name ? fs.readFileSync(path.join(assets, name)) : '', contentType: 'text/javascript' });
      }
      if (url.hostname === '127.0.0.1') return route.continue();
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.__kogolReady);
    await page.evaluate(() => {
      const kogolRows = [
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_0', saldo_id: 100, saldo_rupiah: 1000000, uploaded_at: '2026-10-01T01:00:00Z' },
        { snapshot_date: '2026-10-20', kogol_key: 'KOGOL_0', saldo_id: 30, saldo_rupiah: 300000, uploaded_at: '2026-10-20T01:00:00Z' },
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 20, saldo_rupiah: 200000, uploaded_at: '2026-10-01T01:00:00Z' },
        { snapshot_date: '2026-10-20', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 10, saldo_rupiah: 100000, uploaded_at: '2026-10-20T01:00:00Z' },
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_3_LPJU', saldo_id: 8, saldo_rupiah: 80000, uploaded_at: '2026-10-01T01:00:00Z' },
        { snapshot_date: '2026-10-20', kogol_key: 'KOGOL_3_LPJU', saldo_id: 2, saldo_rupiah: 20000, uploaded_at: '2026-10-20T01:00:00Z' },
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_4', saldo_id: 4, saldo_rupiah: 40000, uploaded_at: '2026-10-01T01:00:00Z' },
      ];
      window.__kogolRpcCalls = [];
      state.user = { id: 'admin-test' };
      state.profile = { role: 'admin', petugas: 'ADMIN' };
      state.supabaseClient = {
        from: (table) => {
          let start = '';
          let end = '';
          const query = {
            select: () => query,
            gte: (_column, value) => { start = value; return query; },
            lte: (_column, value) => { end = value; return query; },
            order: async () => ({ data: table === 'monitoring_kogol_debt_snapshots' ? kogolRows.filter((row) => row.snapshot_date >= start && row.snapshot_date <= end) : [], error: null }),
          };
          return query;
        },
        rpc: async (name, params) => {
          window.__kogolRpcCalls.push({ name, params });
          return { data: { ok: true }, error: null };
        },
      };
      document.getElementById('authGate').hidden = true;
      document.getElementById('appShell').hidden = false;
      kogolDashboardController.syncContext();
      kogolDashboardController.setMonth('2026-10');
      kogolDashboardController.load();
    });

    await page.waitForFunction(() => document.querySelectorAll('.kogol-card').length === 4);
    assert.equal(await page.locator('.kogol-card').count(), 4);
    assert.equal(await page.locator('.kogol-card svg.kogol-donut').count(), 4);
    assert.match(await page.locator('[data-kogol-key="KOGOL_0"] .kogol-donut-rate').textContent(), /70%/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_3_LPJU"] .kogol-donut-rate').textContent(), /75%/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_4"]').innerText(), /Belum lunas/);

    const parsed = await page.evaluate(() => parseKogolUploadRows([
      { IDPEL: '001', RPTAG: '1000', SATKER_MIV: '14032800 - LPJU MUARA SABAK' },
      { IDPEL: '002', RPTAG: '2000', SATKER_MIV: '14040000 - KANTOR ULP SABAK' },
      { IDPEL: '003', RPTAG: '3000', SATKER_MIV: '14040000 - KANTOR ULP SABAK' },
    ], 'kogol3'));
    assert.deepEqual(parsed, [
      { kogolKey: 'KOGOL_3_PERKANTORAN', saldoId: 2, saldoRupiah: 5000 },
      { kogolKey: 'KOGOL_3_LPJU', saldoId: 1, saldoRupiah: 1000 },
    ]);

    const save = await page.evaluate(async () => {
      const ok = await kogolDashboardController.saveSnapshots('2026-10-20', [{ kogolKey: 'KOGOL_4', saldoId: 3, saldoRupiah: 30000 }], 'kogol4.xlsx');
      return { ok, call: window.__kogolRpcCalls.find((item) => item.name === 'save_kogol_debt_snapshot') };
    });
    assert.equal(save.ok, true);
    assert.deepEqual(save.call.params.p_rows, [{ kogol_key: 'KOGOL_4', saldo_id: 3, saldo_rupiah: 30000 }]);
    assert.equal(await page.locator('[data-tab-panel="upload"] [data-upload-panel="database"].upload-panel').count(), 7);
    assert.deepEqual(await page.locator('[data-tab-panel="upload"] [data-upload-panel="database"].upload-panel h2').allTextContents(), [
      'DIL', 'Saldo Awal Kogol 0', 'Saldo Awal Kogol 3', 'Saldo Awal Kogol 4',
      'Saldo Akhir Kogol 0', 'Saldo Akhir Kogol 3', 'Saldo Akhir Kogol 4',
    ]);
    assert.equal(await page.locator('#kogol3AwalInput').count(), 1);
    assert.equal(await page.locator('#kogol4AwalInput').count(), 1);
    assert.equal(await page.locator('#kogolDashboardPanel button[data-tab="upload"]').count(), 1);
    const kogol0 = await page.evaluate(() => ({
      zero: isKogolZero({ kogol: 0 }),
      three: isKogolZero({ kogol: 3 }),
      four: isKogolZero({ kogol: 4 }),
      uploaded: normalizeSaldo([
        { IDPEL: '001', KOGOL: '0', RPTAG: '1000' },
        { IDPEL: '002', KOGOL: '3', RPTAG: '2000' },
        { IDPEL: '003', KOGOL: '4', RPTAG: '3000' },
      ]).filter(isKogolZero).map((row) => row.idpel),
    }));
    assert.deepEqual(kogol0, { zero: true, three: false, four: false, uploaded: ['001'] });

    await page.locator('#kogolDashboardPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'kogol-dashboard-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#kogolDashboardPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'kogol-dashboard-mobile.png'), fullPage: true });
    await page.evaluate(() => switchTab('upload'));
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.add('is-menu-collapsed'));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(qa, 'kogol-upload-mobile.png'), fullPage: true });
    assert.equal(await page.locator('[data-tab-panel="upload"] .upload-panel:visible').count(), 7);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No full-page horizontal overflow on mobile');
    assert.deepEqual(errors, []);
    console.log('PASS Kogol dashboard UI: four charts, classification, save RPC and responsive layout');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
