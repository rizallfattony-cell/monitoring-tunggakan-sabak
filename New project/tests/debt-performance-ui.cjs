const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const qa = path.resolve(process.env.DEBT_PERFORMANCE_QA || path.join(root, '..', '..', 'qa-debt-performance-history'));
const assets = path.resolve(root, '..', '..', 'qa-receipt-history-1.7.4');
fs.mkdirSync(qa, { recursive: true });

function historyRows(months, scope) {
  const source = [
    ['2025-11-01', 51], ['2025-12-01', 55], ['2026-01-01', 57], ['2026-02-01', 60],
    ['2026-03-01', 62], ['2026-04-01', 65], ['2026-05-01', 67], ['2026-06-01', 71],
    ['2026-07-01', 73], ['2026-08-01', 76], ['2026-09-01', 80], ['2026-10-01', 84],
  ];
  return source.slice(-months).map(([month, percent], index) => ({
    month,
    available: !(months === 12 && index === 2),
    officer_count: scope ? 1 : 17,
    awal_id: scope ? 500 : 18592,
    awal_rupiah: scope ? 120000000 : 5715012524,
    akhir_id: scope ? Math.round(500 * (1 - percent / 100)) : Math.round(18592 * (1 - percent / 100)),
    akhir_rupiah: scope ? Math.round(120000000 * (1 - percent / 100)) : Math.round(5715012524 * (1 - percent / 100)),
    pelunasan_id: scope ? Math.round(500 * percent / 100) : Math.round(18592 * percent / 100),
    pelunasan_rupiah: scope ? Math.round(120000000 * percent / 100) : Math.round(5715012524 * percent / 100),
    persen_id: percent,
    persen_tagihan: percent,
    captured_at: '2026-10-31T07:30:00Z',
  }));
}

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, body) => {
      res.writeHead(error ? 404 : 200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
      res.end(error ? 'not found' : body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/app.js')) {
        const body = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace('\nboot();', '\nwindow.__dashboardReady = true;');
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
    await page.waitForFunction(() => window.__dashboardReady);
    await page.evaluate(() => {
      state.user = { id: 'admin-test' };
      state.profile = { role: 'admin', petugas: 'ADMIN' };
      state.report = LPB_PETUGAS.map((item) => ({ petugas: item.biller }));
      state.supabaseClient = { rpc: async (name, params) => {
        if (name !== 'get_debt_performance_history') return { data: {}, error: null };
        const rows = window.__historyRows(params.p_months, params.p_petugas);
        return { data: {
          scope: params.p_petugas || 'ALL', is_admin: true, end_month: params.p_end_month,
          months: params.p_months, officers: LPB_PETUGAS.map((item) => item.biller), rows,
        }, error: null };
      }};
      document.getElementById('authGate').hidden = true;
      document.getElementById('appShell').hidden = false;
    });
    await page.exposeFunction('__historyRowsNode', historyRows);
    await page.evaluate(() => { window.__historyRows = (months, scope) => {
      const source = [
        ['2025-11-01',51],['2025-12-01',55],['2026-01-01',57],['2026-02-01',60],['2026-03-01',62],['2026-04-01',65],
        ['2026-05-01',67],['2026-06-01',71],['2026-07-01',73],['2026-08-01',76],['2026-09-01',80],['2026-10-01',84],
      ];
      return source.slice(-months).map(([month, percent], index) => ({ month, available: !(months === 12 && index === 2), officer_count: scope ? 1 : 17,
        awal_id: scope ? 500 : 18592, awal_rupiah: scope ? 120000000 : 5715012524,
        akhir_id: Math.round((scope ? 500 : 18592) * (1-percent/100)), akhir_rupiah: Math.round((scope ? 120000000 : 5715012524) * (1-percent/100)),
        pelunasan_id: Math.round((scope ? 500 : 18592) * percent/100), pelunasan_rupiah: Math.round((scope ? 120000000 : 5715012524) * percent/100),
        persen_id: percent, persen_tagihan: percent, captured_at: '2026-10-31T07:30:00Z' }));
    }; debtPerformanceController.syncContext(); debtPerformanceController.load(); });
    await page.waitForFunction(() => document.querySelectorAll('#debtPerformanceTableBody tr').length === 6);
    assert.equal(await page.locator('#debtPerformanceScope option').count(), 18);
    assert.equal(await page.locator('#debtPerformanceLatest').innerText(), '84%');
    assert.equal(await page.locator('#debtPerformanceChart svg').count(), 1);
    assert.ok(await page.locator('#debtPerformanceChart circle').count() >= 5);
    assert.equal(await page.locator('#debtPerformanceChart').evaluate((node) => node.getBoundingClientRect().height > 250), true);
    await page.locator('[data-debt-months="12"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#debtPerformanceTableBody tr').length === 12);
    assert.match(await page.locator('#debtPerformanceStatus').innerText(), /11 dari 12 bulan/);
    await page.locator('#debtPerformanceScope').selectOption('ADRI');
    await page.waitForFunction(() => document.querySelector('#debtPerformanceScopeLabel').textContent === 'ADRI');
    await page.locator('#debtPerformancePanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'dashboard-history-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => initializeMainMenu());
    await page.locator('#debtPerformancePanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'dashboard-history-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No full-page horizontal overflow on mobile');
    assert.deepEqual(errors, []);
    console.log('PASS dashboard history UI: ranges, 17 officers, chart, missing month, desktop and mobile layout');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
