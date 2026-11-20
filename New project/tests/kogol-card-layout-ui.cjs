const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const qa = path.resolve(process.env.KOGOL_CARD_QA || path.join(root, '..', '..', 'qa-kogol-cards'));
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
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
      const rows = [
        { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_0', saldo_id: 100, saldo_rupiah: 1000000 },
        { snapshot_date: '2026-11-20', kogol_key: 'KOGOL_0', saldo_id: 30, saldo_rupiah: 300000 },
        { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 20, saldo_rupiah: 200000 },
        { snapshot_date: '2026-11-19', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 2, saldo_rupiah: 20000 },
        { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_3_LPJU', saldo_id: 8, saldo_rupiah: 80000 },
        { snapshot_date: '2026-11-19', kogol_key: 'KOGOL_3_LPJU', saldo_id: 0, saldo_rupiah: 0 },
        { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_4', saldo_id: 4, saldo_rupiah: 40000 },
        { snapshot_date: '2026-11-18', kogol_key: 'KOGOL_4', saldo_id: 3, saldo_rupiah: 30000 },
      ];
      state.user = { id: 'admin-layout-test' };
      state.profile = { role: 'admin', petugas: 'ADMIN' };
      state.supabaseClient = {
        from: () => {
          const query = {
            select: () => query,
            gte: () => query,
            lte: () => query,
            order: async () => ({ data: rows, error: null }),
          };
          return query;
        },
      };
      document.getElementById('authGate').hidden = true;
      document.getElementById('appShell').hidden = false;
      document.querySelector('.workspace-layout').classList.add('is-menu-collapsed');
      attachEvents();
      state.kogolDashboard.selectedMonth = '2026-11';
      renderKogolDashboardControls();
      kogolDashboardController.syncContext();
      kogolDashboardController.setMonth('2026-11');
    });
    await page.waitForFunction(() => document.querySelectorAll('.kogol-card').length === 4);

    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.kogol-card')];
      const rect = (element) => element.getBoundingClientRect();
      const head = rect(document.querySelector('.kogol-dashboard-head'));
      const grid = rect(document.querySelector('.kogol-dashboard-cards'));
      const lpb = rect(document.querySelector('.pln-operational-split'));
      return {
        columns: new Set(cards.map((card) => Math.round(rect(card).left))).size,
        cardHeights: cards.map((card) => Math.round(rect(card).height)),
        footerTops: cards.map((card) => Math.round(rect(card.querySelector('footer')).top)),
        leftAligned: Math.abs(head.left - grid.left) < 1 && Math.abs(grid.left - lpb.left) < 1,
        rightAligned: Math.abs(head.right - grid.right) < 1 && Math.abs(grid.right - lpb.right) < 1,
      };
    });
    assert.equal(layout.columns, 4);
    assert.equal(new Set(layout.cardHeights).size, 1, 'all desktop cards have equal heights');
    assert.equal(new Set(layout.footerTops).size, 1, 'all desktop footers align');
    assert.equal(layout.leftAligned, true);
    assert.equal(layout.rightAligned, true);
    assert.equal(await page.locator('.kogol-card-drill').count(), 4);
    assert.equal(await page.locator('.kogol-card-drill.is-disabled').count(), 3);
    assert.equal(await page.getByText('Data tertinggal').count(), 0);
    assert.equal(await page.locator('.kogol-card.is-complete').count(), 1);
    assert.match(await page.locator('.kogol-card.is-complete').innerText(), /Tuntas/);
    const colors = await page.locator('.kogol-card').evaluateAll((cards) => cards.map((card) => getComputedStyle(card).getPropertyValue('--kogol-status-color').trim()));
    assert.deepEqual(colors, ['#d99100', '#0b8f67', '#0b8f67', '#c44747']);
    await page.screenshot({ path: path.join(qa, 'kogol-cards-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 1024, height: 900 });
    const tabletColumns = await page.locator('.kogol-card').evaluateAll((cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size);
    assert.equal(tabletColumns, 2);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileColumns = await page.locator('.kogol-card').evaluateAll((cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size);
    assert.equal(mobileColumns, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'dashboard fits the mobile viewport');
    await page.screenshot({ path: path.join(qa, 'kogol-cards-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS Kogol card layout UI: alignment, status colors, equal footers and responsive grid');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
