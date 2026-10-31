const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const qa = path.resolve(process.env.DEBT_PERFORMANCE_QA || path.join(root, '..', '..', 'qa-debt-performance-daily'));
const assets = path.resolve(root, '..', '..', 'qa-receipt-history-1.7.4');
fs.mkdirSync(qa, { recursive: true });

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
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
      const officers = PERFORMANCE_PARTICIPANTS;
      const daily = [];
      const makeMonth = (month, lastDay, multiplier) => {
        [1, 10, 20, lastDay].forEach((day, dateIndex) => officers.forEach((petugas, officerIndex) => {
          const opening = 120000000 - (officerIndex * 2100000);
          const balance = Math.max(0, opening - (opening * (0.12 + dateIndex * 0.18) * multiplier));
          daily.push({
            snapshot_date: `${month}-${String(day).padStart(2, '0')}`,
            petugas,
            saldo_id: Math.max(0, 520 - officerIndex * 12 - dateIndex * 70),
            saldo_rupiah: Math.round(balance),
            source_file: `saldo-${month}-${day}.xlsx`,
            uploaded_at: `${month}-${String(day).padStart(2, '0')}T02:00:00Z`,
          });
        }));
      };
      makeMonth('2026-10', 31, 1);
      makeMonth('2026-09', 30, 0.82);
      window.__dailyRpcCalls = [];

      state.user = { id: 'admin-test' };
      state.profile = { role: 'admin', petugas: 'ADMIN' };
      state.report = officers.map((petugas) => ({ petugas }));
      state.supabaseClient = {
        from: () => {
          let start = '';
          let end = '';
          const query = {
            select: () => query,
            gte: (_column, value) => { start = value; return query; },
            lte: (_column, value) => { end = value; return query; },
            order: async () => ({ data: daily.filter((row) => row.snapshot_date >= start && row.snapshot_date <= end), error: null }),
          };
          return query;
        },
        rpc: async (name, params) => {
          if (name === 'save_debt_performance_daily_snapshot' || name === 'delete_debt_performance_daily_snapshot') {
            window.__dailyRpcCalls.push({ name, params });
            return { data: { ok: true }, error: null };
          }
          if (name !== 'get_debt_performance_history') return { data: {}, error: null };
          const end = params.p_end_month.slice(0, 7);
          const rows = Array.from({ length: params.p_months }, (_, index) => {
            const date = new Date(`${end}-01T00:00:00Z`);
            date.setUTCMonth(date.getUTCMonth() - (params.p_months - index - 1));
            const month = date.toISOString().slice(0, 7);
            const available = index > 0 || params.p_months < 12;
            const percent = 48 + index * 4;
            return { month: `${month}-01`, available, awal_rupiah: 1600000000, akhir_rupiah: Math.round(1600000000 * (1 - percent / 100)), akhir_id: 4525, pelunasan_rupiah: Math.round(1600000000 * percent / 100), persen_tagihan: percent };
          });
          return { data: { scope: params.p_petugas || 'ALL', rows }, error: null };
        },
      };
      document.getElementById('debtPerformancePrimaryMonth').value = '2026-10';
      document.getElementById('debtPerformanceCompareMonth').value = '2026-09';
      document.getElementById('authGate').hidden = true;
      document.getElementById('appShell').hidden = false;
      debtPerformanceController.syncContext();
      debtPerformanceController.load();
    });

    await page.waitForFunction(() => document.querySelectorAll('#debtPerformanceLeaderboardBody tr').length === 19);
    assert.equal(await page.locator('#debtPerformanceScope option').count(), 19);
    assert.equal(await page.locator('#debtPerformanceScopeWrap').isHidden(), true);
    assert.equal(await page.locator('#debtPerformanceChart svg').count(), 1);
    assert.equal(await page.locator('#debtPerformanceChart polyline').count(), 2);
    assert.ok(await page.locator('#debtPerformanceChart circle').count() >= 8);
    assert.match(await page.locator('#debtPerformanceStatus').innerText(), /4 tanggal/);
    assert.match(await page.locator('#debtPerformanceOpening').innerText(), /Rp/);
    assert.equal(await page.locator('#debtPerformanceLeaderboardBody tr').count(), 19);
    assert.equal(await page.locator('button[data-tab="pelunasan-harian"]', { hasText: 'Upload Saldo Harian' }).count(), 1);

    const saveResult = await page.evaluate(async () => {
      const ok = await debtPerformanceController.saveSnapshot('2026-10-31', {
        petugas: {
          ADRI: { akhirId: 12, akhirRupiah: 345000 },
          '<41500-6600': { akhirId: 1, akhirRupiah: 999999 },
        },
      }, 'saldo-harian.xlsx');
      return { ok, call: window.__dailyRpcCalls.find((item) => item.name === 'save_debt_performance_daily_snapshot') };
    });
    assert.equal(saveResult.ok, true);
    assert.equal(saveResult.call.params.p_rows.length, 19, '17 billers and two agreed saldo groups are stored, including zero balance');
    assert.deepEqual(saveResult.call.params.p_rows.find((row) => row.petugas === 'ADRI'), { petugas: 'ADRI', saldo_id: 12, saldo_rupiah: 345000 });
    assert.deepEqual(saveResult.call.params.p_rows.find((row) => row.petugas === '<41500-6600'), { petugas: '<41500-6600', saldo_id: 1, saldo_rupiah: 999999 });

    const mappedSnapshot = await page.evaluate(() => {
      state.dil = [{ idpel: 'DIL-1', petugas: 'EKO DARWANTO', nama: 'Pelanggan DIL' }];
      const row = (idpel, petugas, rupiah) => ({
        idpel,
        petugas,
        rupiah,
        lembar: 0,
        nama: 'Pelanggan uji',
        tarif: '',
        daya: '',
        alamat: '',
        kolok: '',
        koked: '',
      });
      return buildDailyPelunasanSnapshot([
        row('DIL-1', 'kategori tidak dikenal', 200),
        row('ADRI-1', '14390.adri01', 300),
        row('OUT-1', '<41500-6600', 999999),
        row('TRI-1', 'TRI WIBOWO', 400),
        row('GROUP-1', '>41500', 600),
      ]);
    });
    assert.deepEqual(Object.keys(mappedSnapshot.petugas).sort(), ['<41500-6600', '>41500', 'ADRI', 'EKO DARWANTO', 'TRI RIBOWO']);
    assert.equal(mappedSnapshot.total.akhirRupiah, 1001499);
    assert.equal(mappedSnapshot.ignoredRows, 0, 'the agreed saldo groups are retained');
    assert.equal(mappedSnapshot.petugas['TRI RIBOWO'].akhirRupiah, 400, 'old TRI WIBOWO spelling maps to TRI RIBOWO');
    assert.equal(mappedSnapshot.petugas['>41500'].akhirRupiah, 600, 'agreed saldo groups override the DIL fallback');

    await page.locator('#debtPerformanceLeaderboardBody [data-performance-officer]').first().click();
    await page.waitForFunction(() => !document.getElementById('debtPerformanceOfficerComparison').hidden);
    assert.equal(await page.locator('#debtPerformanceOfficerBody tr').count(), 2);
    assert.match(await page.locator('#debtPerformanceChartTitle').innerText(), /Tren Saldo Harian/);

    await page.locator('[data-debt-months="12"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#debtPerformanceHistoryBody tr').length === 12);
    assert.equal(await page.locator('#debtPerformanceHistoryChart svg').count(), 1);

    await page.locator('[data-performance-view="unit"]').click();
    await page.locator('#debtPerformancePanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'dashboard-performance-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => initializeMainMenu());
    await page.locator('#debtPerformancePanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'dashboard-performance-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No full-page horizontal overflow on mobile');
    assert.deepEqual(errors, []);
    console.log('PASS daily performance dashboard UI: unit, officer, comparison, history and responsive layout');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
