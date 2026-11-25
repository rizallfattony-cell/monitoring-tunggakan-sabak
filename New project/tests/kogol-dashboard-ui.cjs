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
    assert.equal(await page.locator('#authSessionLoader').isVisible(), true, 'Saat awal web hanya menampilkan pemulihan sesi');
    assert.equal(await page.locator('#authGate').isHidden(), true, 'Form login tidak berkedip sebelum pemeriksaan sesi selesai');
    await page.screenshot({ path: path.join(qa, 'auth-session-loader.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(qa, 'auth-session-loader-mobile.png'), fullPage: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Loader sesi tidak overflow pada ponsel');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => {
      const kogolRows = [
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_0', saldo_id: 100, saldo_rupiah: 1000000, uploaded_at: '2026-10-01T01:00:00Z' },
        { snapshot_date: '2026-10-20', kogol_key: 'KOGOL_0', saldo_id: 30, saldo_rupiah: 300000, uploaded_at: '2026-10-20T01:00:00Z' },
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 20, saldo_rupiah: 200000, source_file: 'kogol3-awal.xlsx', uploaded_at: '2026-10-01T01:00:00Z' },
        { snapshot_date: '2026-10-20', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 10, saldo_rupiah: 100000, source_file: 'kogol3-akhir.xlsx', uploaded_at: '2026-10-20T01:00:00Z' },
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_3_LPJU', saldo_id: 8, saldo_rupiah: 80000, uploaded_at: '2026-10-01T01:00:00Z' },
        { snapshot_date: '2026-10-20', kogol_key: 'KOGOL_3_LPJU', saldo_id: 2, saldo_rupiah: 20000, uploaded_at: '2026-10-20T01:00:00Z' },
        { snapshot_date: '2026-10-01', kogol_key: 'KOGOL_4', saldo_id: 4, saldo_rupiah: 40000, uploaded_at: '2026-10-01T01:00:00Z' },
      ];
      window.__kogolRows = kogolRows;
      window.__kogolRpcCalls = [];
      state.user = { id: 'admin-test', email: 'admin@monalisa.test' };
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
      attachEvents();
      updateOnlineUi();
      state.kogolDashboard.selectedMonth = '2026-10';
      renderKogolDashboardControls();
      kogolDashboardController.syncContext();
      kogolDashboardController.setMonth('2026-10');
      kogolDashboardController.load();
    });

    assert.equal(await page.locator('#authSessionLoader').isVisible(), true, 'Loader tetap tampil sampai durasi empat detik selesai');
    await page.waitForFunction(() => document.querySelector('#authSessionLoader').hidden, null, { timeout: 6000 });
    assert.ok(await page.evaluate(() => performance.now()) >= 3900, 'Loader berjalan sekitar empat detik sebelum ditutup');
    assert.equal(await page.locator('#authSessionLoader').isHidden(), true, 'Loader ditutup setelah durasi empat detik dan sesi dipulihkan');
    assert.equal(await page.locator('#authGate').isHidden(), true, 'Form login tetap tersembunyi untuk sesi aktif');
    assert.equal(await page.locator('#appShell').isVisible(), true, 'Dashboard langsung tampil untuk sesi aktif');
    await page.waitForFunction(() => document.querySelectorAll('.kogol-card').length === 4);
    assert.equal(await page.locator('.tree-index').count(), 0, 'Nomor menu sidebar harus dihapus');
    assert.equal(await page.locator('.side-menu-title').count(), 0, 'Strip kosong sidebar harus dihapus');
    assert.equal(await page.locator('.kogol-donut-caption').count(), 0, 'Donut hanya menampilkan persentase');
    assert.equal(await page.locator('.pln-sidebar-logo').count(), 0, 'Sidebar tidak lagi memakai gambar logo');
    assert.equal(await page.locator('.pln-sidebar-wordmark strong').innerText(), 'MONALISA');
    assert.match(await page.locator('.pln-sidebar-wordmark span').innerText(), /Monitoring Tunggakan dan Analisis Kinerja/);
    assert.doesNotMatch(await page.locator('.pln-unit-badge').innerText(), /Monitoring Operasional/);
    assert.equal(await page.locator('#profileMenu').isHidden(), true, 'Menu profil awalnya tertutup');
    await page.locator('#profileMenuButton').click();
    assert.equal(await page.locator('#profileMenu').isVisible(), true, 'Klik profil membuka menu');
    assert.equal(await page.locator('#logoutButton').isVisible(), true, 'Menu profil menampilkan tombol keluar');
    await page.screenshot({ path: path.join(qa, 'profile-menu-desktop.png'), fullPage: false });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#profileMenu').isHidden(), true, 'Escape menutup menu profil');
    const mobileMenuGroup = page.locator('[data-protected-menu="mobile"]');
    assert.equal(await mobileMenuGroup.getAttribute('class'), 'tree-group is-locked', 'Menu Aplikasi Mobile terkunci saat halaman dibuka');
    assert.equal(await page.locator('#mobileMenuLockIndicator').isVisible(), true, 'Ikon kunci tampil pada menu Aplikasi Mobile');
    await page.locator('#mobileMenuToggle').click();
    assert.equal(await page.locator('#mobileMenuLockModal').isVisible(), true, 'Klik menu terkunci membuka dialog password');
    assert.equal(await mobileMenuGroup.evaluate((element) => element.classList.contains('is-open')), false, 'Submenu belum terbuka sebelum verifikasi');
    await page.screenshot({ path: path.join(qa, 'mobile-menu-lock-dialog.png'), fullPage: false });
    await page.locator('#mobileMenuPasswordInput').fill('123456');
    await page.locator('#mobileMenuLockForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /Password salah/i.test(document.querySelector('#mobileMenuLockStatus').textContent));
    assert.equal(await mobileMenuGroup.evaluate((element) => element.classList.contains('is-open')), false, 'Password salah tidak membuka submenu');
    await page.evaluate(() => switchTab('invoice'));
    assert.equal(await page.locator('[data-tab-panel="invoice"]').isHidden(), true, 'Akses langsung ke halaman terlindungi tetap diblokir');
    assert.equal(await page.locator('#mobileMenuLockModal').isVisible(), true, 'Akses langsung tetap meminta password');
    await page.locator('#mobileMenuPasswordInput').fill('272823');
    await page.locator('#mobileMenuLockForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#mobileMenuLockModal').hidden);
    assert.equal(await page.evaluate(() => state.mobileMenuUnlocked), true, 'Password benar membuka menu untuk sesi halaman');
    assert.equal(await mobileMenuGroup.evaluate((element) => element.classList.contains('is-open')), true, 'Submenu terbuka setelah verifikasi');
    assert.equal(await page.locator('#mobileMenuLockIndicator').isHidden(), true, 'Ikon kunci disembunyikan setelah verifikasi');
    assert.equal(await page.locator('[data-tab-panel="invoice"]').isVisible(), true, 'Halaman tujuan dibuka setelah verifikasi berhasil');
    await page.evaluate(() => switchTab('overview'));
    await page.screenshot({ path: path.join(qa, 'sidebar-clean-desktop.png'), fullPage: false });
    assert.equal(await page.locator('.kogol-card').count(), 4);
    assert.equal(await page.locator('.kogol-card svg.kogol-donut').count(), 4);
    assert.match(await page.locator('[data-kogol-key="KOGOL_0"] .kogol-donut-rate').textContent(), /70\s*%/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_3_LPJU"] .kogol-donut-rate').textContent(), /75\s*%/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_4"]').innerText(), /Belum Lunas/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_0"] .kogol-card-figures strong').innerText(), /Rp\s*300\.000/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_0"] .kogol-share').innerText(), /65,2%/);
    assert.equal(await page.locator('.kogol-share-track').count(), 4);
    assert.match(await page.locator('#kogol3AwalStatus').innerText(), /File tersimpan/i);
    assert.match(await page.locator('#kogol3Status').innerText(), /File tersimpan/i);
    assert.match(await page.locator('#kogol3AwalStatus').innerText(), /kogol3-awal\.xlsx/i);
    assert.match(await page.locator('#kogol3Status').innerText(), /kogol3-akhir\.xlsx/i);
    assert.match(await page.locator('#kogol4AwalStatus').innerText(), /File tersimpan/i);
    assert.match(await page.locator('#kogol4Status').innerText(), /Belum ada file/i);
    await page.evaluate(async () => {
      window.__kogolRows.push({
        snapshot_date: '2026-10-20', kogol_key: 'KOGOL_4', saldo_id: 1,
        saldo_rupiah: 10000, source_file: 'kogol4-akhir.xlsx', uploaded_at: '2026-10-20T01:00:00Z',
      });
      await kogolDashboardController.load({ force: true });
    });
    assert.match(await page.locator('#kogol4Status').innerText(), /kogol4-akhir\.xlsx/i);
    assert.match(await page.locator('#kogolUploadStatus').innerText(), /4 dari 4 file/i);
    const dashboardBounds = await page.evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector).getBoundingClientRect();
        return { left: value.left, right: value.right, width: value.width };
      };
      return {
        container: rect('.dashboard-container'),
        kogol: rect('#kogolDashboardPanel'),
        lpb: rect('.pln-operational-split'),
        performance: rect('#debtPerformancePanel'),
      };
    });
    assert.ok(dashboardBounds.container.width <= 1500, 'Dashboard container respects the 1500px maximum');
    assert.ok(Math.abs(dashboardBounds.kogol.left - dashboardBounds.lpb.left) < 1, 'Kogol and LPB left edges align');
    assert.ok(Math.abs(dashboardBounds.kogol.right - dashboardBounds.performance.right) < 1, 'Kogol and performance right edges align');

    await page.evaluate(() => {
      state.lpbMonitoring = normalizeLpbMonitoringState({
        previousIds: ['143900000001'], targetPerBiller: 1,
        startDate: '2026-10-01', endDate: '2026-10-19',
        latestRows: [
          { idpel: '143900000001', readDate: '2026-10-18', username: '14390.adri01' },
          { idpel: '143900000002', readDate: '2026-10-20', username: '14390.adri01' },
          { idpel: '143900000003', readDate: '2026-10-20', username: '14390.anang01' },
          { idpel: '143900000004', readDate: '2026-10-20', username: 'not-mapped' },
        ],
      });
      renderLpbOverview();
    });
    assert.equal(await page.locator('#lpbOverviewRealization').innerText(), '2');
    assert.equal(await page.locator('#lpbOverviewTarget').innerText(), '17');
    assert.equal(await page.locator('#lpbOverviewRemaining').innerText(), '15');
    assert.match(await page.locator('#lpbOverviewChart').innerText(), /11,8\s*%/);
    assert.equal(await page.locator('#lpbOverviewChart .lpb-progress-track').count(), 1);
    assert.match(await page.locator('#lpbOverviewPaceStatus').innerText(), /9 IDPEL/);
    assert.match(await page.locator('#lpbOverviewPaceLegend').innerText(), /hari ke-20.*11 IDPEL/);
    assert.match(await page.locator('#lpbOverviewStatus').innerText(), /20 Oktober 2026/);
    await page.evaluate(() => { state.kogolDashboard.selectedMonth = '2026-11'; renderLpbOverview(); });
    assert.equal(await page.locator('#lpbOverviewRealization').innerText(), '-');
    assert.match(await page.locator('#lpbOverviewPaceStatus').innerText(), /Menunggu data LPB/);
    assert.match(await page.locator('#lpbOverviewStatus').innerText(), /Belum ada data LPB/);
    await page.evaluate(() => { state.kogolDashboard.selectedMonth = '2026-10'; renderLpbOverview(); });

    await page.evaluate(() => {
      const rows = Array.from({ length: 30 }, (_, index) => ({
        petugas: index < 15 ? 'ADRI' : 'AMRIZAL',
        idpel: String(143900000000 + index), nama: `Pelanggan ${index}`,
        alamat: `Alamat ${index}`, tarif: 'R1', daya: '900',
        lembar: '1', kolok: index === 16 ? '01' : index === 15 ? '02' : String(100 + index), koked: `K${String(index).padStart(2, '0')}`,
        rptag: index === 0 ? 100000 : index === 15 ? 172000 : 1000,
      }));
      state.remainingByPetugas = new Map([
        ['ADRI', rows.slice(0, 15)], ['AMRIZAL', rows.slice(15)],
      ]);
      state.report = [
        { petugas: '>41500', awalId: 20, awalRupiah: 20000, akhirId: 19, akhirRupiah: 19800, pelunasanPel: 1, pelunasanRupiah: 200, persenPel: 5, persenTagihan: 1 },
        { petugas: '<41500-6600', awalId: 20, awalRupiah: 20000, akhirId: 18, akhirRupiah: 19600, pelunasanPel: 2, pelunasanRupiah: 400, persenPel: 10, persenTagihan: 2 },
        { petugas: 'AMRIZAL', awalId: 20, awalRupiah: 250000, akhirId: 15, akhirRupiah: 186000, pelunasanPel: 5, pelunasanRupiah: 64000, persenPel: 25, persenTagihan: 25.6 },
        { petugas: 'ADRI', awalId: 20, awalRupiah: 250000, akhirId: 15, akhirRupiah: 114000, pelunasanPel: 5, pelunasanRupiah: 136000, persenPel: 25, persenTagihan: 54.4 },
        { petugas: 'DEDI YANTO', awalId: 10, awalRupiah: 100000, akhirId: 4, akhirRupiah: 40000, pelunasanPel: 6, pelunasanRupiah: 60000, persenPel: 60, persenTagihan: 60 },
        { petugas: 'HASIM', awalId: 10, awalRupiah: 100000, akhirId: 3, akhirRupiah: 30000, pelunasanPel: 7, pelunasanRupiah: 70000, persenPel: 70, persenTagihan: 70 },
        { petugas: 'SUWARDI', awalId: 10, awalRupiah: 100000, akhirId: 2, akhirRupiah: 20000, pelunasanPel: 8, pelunasanRupiah: 80000, persenPel: 80, persenTagihan: 80 },
        { petugas: 'ANANG RIDWAN', awalId: 10, awalRupiah: 100000, akhirId: 1, akhirRupiah: 10000, pelunasanPel: 9, pelunasanRupiah: 90000, persenPel: 90, persenTagihan: 90 },
        { petugas: 'ARBAIN', awalId: 20, awalRupiah: 200000, akhirId: 1, akhirRupiah: 10000, pelunasanPel: 19, pelunasanRupiah: 190000, persenPel: 95, persenTagihan: 95 },
      ];
      state.anomalies = [{ type: 'Saldo akhir naik', message: 'Contoh petugas: saldo akhir lebih besar dari saldo awal pada IDPEL atau rupiah.' }];
      state.uploadMeta.akhir = { uploadedAt: '2026-10-20T01:00:00Z' };
    });
    await page.locator('[data-kogol-key="KOGOL_0"]').click();
    await page.waitForFunction(() => document.querySelector('[data-tab-panel="kogol0-detail"]').classList.contains('is-active'));
    assert.match(await page.locator('#kogol0DetailStatus').innerText(), /30 pelanggan cocok/);
    assert.equal(await page.locator('#kogol0DetailSummary').count(), 0, 'Kartu ringkasan atas dihapus');
    assert.equal(await page.locator('.kogol0-dashboard-button').isVisible(), true, 'Aksi kembali ke dashboard tetap tersedia');
    assert.match(await page.locator('#kogol0DetailFilteredCount').innerText(), /Menampilkan 19 dari 19 petugas/);
    assert.equal(await page.locator('#kogol0DetailTableTitle').innerText(), 'Monitoring Tunggakan per Petugas');
    assert.equal(await page.locator('#kogol0DetailSearchControl').isHidden(), true, 'Pencarian nama petugas dihilangkan dari tabel monitoring');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').count(), 19);
    assert.equal(await page.locator('#kogol0DetailTable tbody tr.is-low-performer').count(), 5, 'Lima petugas terbawah diberi status merah');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr.is-low-performer .kogol0-monitoring-name').evaluateAll((nodes) => nodes.some((node) => /^[<>]/.test(node.textContent.trim()))), false, 'Kelompok tarif tidak dihitung sebagai petugas terbawah');
    assert.equal(await page.locator('#kogol0DetailTable thead tr').count(), 2);
    assert.equal(await page.locator('#kogol0DetailTable thead tr').first().locator('th').count(), 7);
    assert.equal(await page.locator('#kogol0DetailSort').inputValue(), 'percentDesc', 'Urutan awal khusus halaman adalah pelunasan tertinggi');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').first().locator('.kogol0-monitoring-name').innerText(), 'ARBAIN');
    const amrizalRow = page.locator('#kogol0DetailTable tbody tr').filter({ hasText: 'AMRIZAL' }).first();
    assert.match(await amrizalRow.innerText(), /250\.000.*186\.000.*64\.000.*26%/s);
    assert.equal(await amrizalRow.locator('[data-preview-officer="AMRIZAL"]').count(), 1);
    assert.equal(await page.locator('.kogol0-detail-toolbar-heading .icon-button').count(), 0, 'Panah di samping judul monitoring dihapus');
    const tableAndUtility = await page.evaluate(() => ({
      tableBottom: document.querySelector('#kogol0DetailTable').getBoundingClientRect().bottom,
      utilityTop: document.querySelector('.kogol0-detail-utility').getBoundingClientRect().top,
    }));
    assert.ok(tableAndUtility.utilityTop >= tableAndUtility.tableBottom, 'Kontrol pencarian dan ekspor berada di bawah tabel');
    assert.equal(await page.locator('#kogol0DetailAnomalyModal').isVisible(), true, 'Popup muncul otomatis saat anomali tersedia');
    assert.equal(await page.locator('#kogol0DetailAnomalyCount').innerText(), '1');
    assert.match(await page.locator('#kogol0DetailAnomalyList').innerText(), /Saldo akhir naik.*saldo akhir lebih besar/s);
    await page.screenshot({ path: path.join(qa, 'kogol0-anomaly-popup-desktop.png'), fullPage: false });
    await page.locator('#kogol0DetailAnomalyDismiss').click();
    assert.equal(await page.locator('#kogol0DetailAnomalyModal').isHidden(), true, 'Popup anomali dapat ditutup sambil data diperbaiki');
    await page.locator('#kogol0DetailMaximize').click();
    assert.equal(await page.locator('.kogol0-detail-card').evaluate((element) => element.classList.contains('is-maximized')), true, 'Tombol Maximize memenuhi viewport dengan tabel');
    assert.equal(await page.locator('#kogol0DetailMaximize').innerText(), 'Tutup Maximize');
    assert.equal(await page.locator('#kogol0DetailMaximize').getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: path.join(qa, 'kogol0-monitoring-maximized.png'), fullPage: false });
    await page.locator('#kogol0DetailMaximize').click();
    assert.equal(await page.locator('.kogol0-detail-card').evaluate((element) => element.classList.contains('is-maximized')), false, 'Tombol Tutup Maximize mengembalikan tabel ke ukuran normal');
    await page.locator('#kogol0DetailMaximize').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.kogol0-detail-card').evaluate((element) => element.classList.contains('is-maximized')), false, 'Escape menutup mode maximize');
    assert.equal(await page.locator('#kogol0DetailMaximize').innerText(), 'Maximize');
    assert.match(await page.locator('[data-primary-nav]').innerText(), /Monitoring Kogol 0/);
    assert.equal(await page.locator('[data-primary-nav]').evaluate((element) => element.classList.contains('is-active')), true);
    await page.locator('#kogol0DetailSort').selectOption('nameAsc');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').first().locator('.kogol0-monitoring-name').innerText(), '<41500-6600');
    await page.locator('#kogol0DetailSort').selectOption('amountDesc');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').first().locator('.kogol0-monitoring-name').innerText(), 'AMRIZAL');
    assert.equal(await page.locator('#kogol0DetailAnomalyModal').isHidden(), true, 'Perubahan urutan tidak membuka ulang popup yang sudah ditutup');
    assert.equal(await page.locator('#kogol0DetailExportImage').innerText(), 'Export Image HD');
    assert.equal(await page.locator('#kogol0DetailExport').innerText(), 'Export Excel');
    await page.evaluate(() => {
      window.XLSX.writeFile = (workbook, filename) => {
        window.__excelFilename = filename;
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        window.__excelMatrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
      };
      const nativeToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function captureCanvas(type, quality) {
        window.__imageCanvas = { width: this.width, height: this.height, type, quality };
        return nativeToDataURL.call(this, type, quality);
      };
      HTMLAnchorElement.prototype.click = function captureDownload() {
        window.__imageFilename = this.download;
        window.__imageHref = this.href;
      };
    });
    await page.locator('#kogol0DetailExportImage').click();
    assert.match(await page.evaluate(() => window.__imageFilename), /-hd\.jpg$/i, 'Ekspor gambar menghasilkan JPEG HD yang kompatibel dengan WhatsApp');
    assert.match(await page.evaluate(() => window.__imageHref), /^data:image\/jpeg/i, 'Ekspor HD memakai format JPEG');
    const imageCanvas = await page.evaluate(() => window.__imageCanvas);
    assert.ok(Math.max(imageCanvas.width, imageCanvas.height) >= 2560, 'Sisi panjang gambar melewati target HD WhatsApp 2560px');
    assert.equal(imageCanvas.quality, 0.96, 'JPEG menggunakan kualitas tinggi');
    await page.locator('#kogol0DetailExport').click();
    assert.match(await page.evaluate(() => window.__excelFilename), /\.xlsx$/i, 'Ekspor tabel menghasilkan XLSX');
    await page.locator('#kogol0DetailSort').selectOption('percentDesc');
    await page.screenshot({ path: path.join(qa, 'kogol0-unified-monitoring-desktop.png'), fullPage: true });
    await page.locator('#kogol0DetailTable .kogol0-open-button[data-preview-officer="AMRIZAL"]').click();
    await page.waitForFunction(() => document.querySelector('#kogol0PreviewDrawer').classList.contains('is-open'));
    await page.waitForFunction(() => {
      const drawer = document.querySelector('#kogol0PreviewDrawer');
      const transform = getComputedStyle(drawer).transform;
      return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
    });
    assert.equal(await page.locator('#kogol0PreviewTitle').innerText(), 'AMRIZAL');
    assert.equal(await page.locator('#kogol0PreviewList .kogol0-preview-item').count(), 10);
    assert.match(await page.locator('#kogol0PreviewList .kogol0-preview-item').first().innerText(), /Pelanggan 15.*Rp\s*172\.000/s);
    assert.match(await page.locator('#kogol0PreviewFooterText').innerText(), /10 dari 15 IDPEL/);
    await page.screenshot({ path: path.join(qa, 'kogol0-preview-desktop.png'), fullPage: true });
    await page.locator('#kogol0PreviewViewAll').click();
    assert.equal(await page.locator('#kogol0DetailSort').inputValue(), 'exportOrder', 'Lihat semua IDPEL mengikuti urutan export lama');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').first().locator('.customer-name').innerText(), 'Pelanggan 16');
    await page.locator('#kogol0DetailExport').click();
    assert.match(await page.evaluate(() => window.__excelFilename), /kogol-0-amrizal-.*\.xlsx$/i);
    const customerExport = await page.evaluate(() => window.__excelMatrix);
    assert.deepEqual(customerExport[0], ['NO', 'IDPEL', 'NAMA', 'TARIF', 'DAYA', 'ALAMAT', 'LEMBAR', 'KOLOK', 'KOKED', 'RPTAG']);
    assert.equal(customerExport[1][2], 'Pelanggan 16', 'Baris Excel pertama mengikuti KOLOK/KOKED');
    await page.locator('#kogol0DetailSearch').fill('Pelanggan 16');
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').count(), 1);
    await page.locator('#kogol0DetailSearch').fill('');
    await page.screenshot({ path: path.join(qa, 'kogol0-customers-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.add('is-menu-collapsed'));
    await page.screenshot({ path: path.join(qa, 'kogol0-customers-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Customer table scrolls within mobile viewport');
    await page.locator('#kogol0DetailBack').click();
    await page.screenshot({ path: path.join(qa, 'kogol0-unified-monitoring-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Kogol 0 detail fits mobile viewport');
    await page.locator('#kogol0DetailTable [data-preview-officer="AMRIZAL"]').first().click();
    await page.waitForFunction(() => document.querySelector('#kogol0PreviewDrawer').classList.contains('is-open'));
    await page.waitForFunction(() => {
      const drawer = document.querySelector('#kogol0PreviewDrawer');
      const transform = getComputedStyle(drawer).transform;
      return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
    });
    assert.equal(await page.locator('#kogol0PreviewList .kogol0-preview-item').count(), 10);
    await page.screenshot({ path: path.join(qa, 'kogol0-preview-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Kogol 0 preview drawer fits mobile viewport');
    await page.locator('#kogol0PreviewClose').click();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.remove('is-menu-collapsed'));
    await page.locator('[data-tab-panel="kogol0-detail"] [data-tab="overview"]').click();
    await page.locator('[data-primary-nav]').click();
    await page.waitForFunction(() => document.querySelector('[data-tab-panel="kogol0-detail"]').classList.contains('is-active'));
    assert.equal(await page.locator('.kogol0-dashboard-button').isHidden(), true, 'Tombol dashboard disembunyikan saat halaman dibuka langsung dari menu Monitoring Kogol 0');
    assert.equal(await page.locator('#kogol0DetailAnomalyModal').isVisible(), true, 'Popup anomali muncul kembali saat halaman dibuka ulang');
    await page.locator('#kogol0DetailAnomalyClose').click();
    await page.evaluate(() => switchTab('overview'));
    await page.evaluate(() => {
      const rows = [...state.remainingByPetugas.values()].flat();
      state.remainingByPetugas = new Map();
      const originalFrom = state.supabaseClient.from;
      state.supabaseClient.from = (table) => {
        if (table !== 'monitoring_remaining_customers') return originalFrom(table);
        const query = {
          select: () => query, eq: () => query, order: () => query,
          range: async (start, end) => ({ data: rows.slice(start, end + 1).map((row, index) => ({ ...row, id: start + index + 1, uploaded_at: '2026-10-20T01:00:00Z' })), error: null }),
        };
        return query;
      };
    });
    await page.locator('[data-kogol-key="KOGOL_0"]').click();
    await page.waitForFunction(() => document.querySelector('#kogol0DetailStatus').textContent.includes('30 pelanggan cocok'));
    if (await page.locator('#kogol0DetailAnomalyModal').isVisible()) await page.locator('#kogol0DetailAnomalyClose').click();
    assert.equal(await page.locator('#kogol0DetailTable tbody tr').count(), 19, 'Online fallback loads officer detail');
    await page.evaluate(async () => {
      const summary = window.SimontokKogolDashboard.buildSummary(window.__kogolRows, '2026-10')[0];
      summary.closing.snapshotDate = '2026-10-19';
      await kogol0DetailController.open(summary);
    });
    assert.match(await page.locator('#kogol0DetailStatus').innerText(), /tanggal unggahan lain/i);
    if (await page.locator('#kogol0DetailAnomalyModal').isVisible()) await page.locator('#kogol0DetailAnomalyClose').click();
    await page.evaluate(() => switchTab('overview'));

    const parsed = await page.evaluate(() => parseKogolUploadRows([
      { IDPEL: '001', RPTAG: '1000', SATKER_MIV: '14032800 - LPJU MUARA SABAK' },
      { IDPEL: '002', RPTAG: '2000', SATKER_MIV: '14040000 - KANTOR ULP SABAK' },
      { IDPEL: '003', RPTAG: '3000', SATKER_MIV: '14040000 - KANTOR ULP SABAK' },
    ], 'kogol3'));
    assert.deepEqual(parsed, [
      { kogolKey: 'KOGOL_3_PERKANTORAN', saldoId: 2, saldoRupiah: 5000 },
      { kogolKey: 'KOGOL_3_LPJU', saldoId: 1, saldoRupiah: 1000 },
    ]);

    const parsedWithoutReadableSatkerHeader = await page.evaluate(() => parseKogolUploadRows([
      { IDPEL: '001', RPTAG: '1000', KOLOM_7: '14032800 - LPJU MUARA SABAK' },
      { IDPEL: '002', RPTAG: '2000', KOLOM_7: '14040000 - KANTOR ULP SABAK' },
    ], 'kogol3'));
    assert.deepEqual(parsedWithoutReadableSatkerHeader, [
      { kogolKey: 'KOGOL_3_PERKANTORAN', saldoId: 1, saldoRupiah: 2000 },
      { kogolKey: 'KOGOL_3_LPJU', saldoId: 1, saldoRupiah: 1000 },
    ]);

    const inheritedHeader = await page.evaluate(() => {
      const sheet = XLSX.utils.aoa_to_sheet([
        ['', '', 'SATKER_MIV'],
        ['IDPEL', 'RPTAG', ''],
        ['001', '1000', '14032800 - LPJU MUARA SABAK'],
      ]);
      return sheetToObjects(sheet)[0];
    });
    assert.equal(inheritedHeader.SATKER_MIV, '14032800 - LPJU MUARA SABAK');

    const save = await page.evaluate(async () => {
      const ok = await kogolDashboardController.saveSnapshots('2026-10-20', [{ kogolKey: 'KOGOL_4', saldoId: 3, saldoRupiah: 30000 }], 'kogol4.xlsx');
      return { ok, call: window.__kogolRpcCalls.find((item) => item.name === 'save_kogol_debt_snapshot') };
    });
    assert.equal(save.ok, true);
    assert.deepEqual(save.call.params.p_rows, [{ kogol_key: 'KOGOL_4', saldo_id: 3, saldo_rupiah: 30000 }]);
    assert.equal(await page.locator('[data-tab-panel="upload"] [data-upload-panel="database"] .upload-panel').count(), 7);
    assert.deepEqual(await page.locator('[data-tab-panel="upload"] [data-upload-panel="database"] h4').allTextContents(), [
      'Saldo Awal Kogol 0', 'Saldo Akhir Kogol 0', 'Saldo Awal Kogol 3',
      'Saldo Akhir Kogol 3', 'Saldo Awal Kogol 4', 'Saldo Akhir Kogol 4',
    ]);
    assert.equal(await page.locator('#kogolDateInput').count(), 0);
    const automaticDate = await page.evaluate(async () => {
      const originalRead = readWorkbook;
      const originalSave = saveKogolSnapshot;
      const originalDate = window.SimontokKogolDashboard.wibDate;
      const calls = [];
      readWorkbook = async () => [{ IDPEL: '001', RPTAG: '1000', SATKER_MIV: '14032800 - LPJU MUARA SABAK' }];
      saveKogolSnapshot = async (date, rows) => { calls.push({ date, rows }); return true; };
      window.SimontokKogolDashboard.wibDate = () => '2026-11-05';
      state.kogolDashboard.selectedMonth = '2026-10';
      try {
        await handleKogolUpload({ target: { files: [new File([''], 'saldo3.xlsx')], value: '' } }, 'kogol3', 'akhir');
        return calls;
      } finally {
        readWorkbook = originalRead;
        saveKogolSnapshot = originalSave;
        window.SimontokKogolDashboard.wibDate = originalDate;
      }
    });
    assert.equal(automaticDate[0].date, '2026-11-05', 'Closing upload uses WIB upload date, not selected opening month');
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

    await page.evaluate(() => switchTab('overview'));
    await page.evaluate(async () => {
      const balances = [
        ['KOGOL_0', 6146332629, 5644198824],
        ['KOGOL_3_PERKANTORAN', 448744879, 417708103],
        ['KOGOL_3_LPJU', 227611647, 227611647],
        ['KOGOL_4', 18114193, 7082359],
      ];
      for (const [key, opening, closing] of balances) {
        window.__kogolRows.find((row) => row.kogol_key === key && row.snapshot_date === '2026-10-01').saldo_rupiah = opening;
        window.__kogolRows.find((row) => row.kogol_key === key && row.snapshot_date === '2026-10-20').saldo_rupiah = closing;
      }
      await kogolDashboardController.load({ force: true });
    });
    assert.match(await page.locator('[data-kogol-key="KOGOL_0"] .kogol-card-figures strong').innerText(), /Rp\s*5\.644\.198\.824/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_0"] .kogol-breakdown').innerText(), /Rp\s*502\.133\.805/);
    assert.match(await page.locator('[data-kogol-key="KOGOL_3_PERKANTORAN"] .kogol-card-figures strong').innerText(), /Rp\s*417\.708\.103/);
    await page.locator('#kogolDashboardPanel').scrollIntoViewIfNeeded();
    await page.evaluate(() => { document.getElementById('progressPanel').hidden = true; });
    await page.screenshot({ path: path.join(qa, 'kogol-dashboard-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.add('is-menu-collapsed'));
    await page.locator('#kogolDashboardPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'kogol-dashboard-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.kogol-card')].some((card) => card.scrollWidth > card.clientWidth)), false, 'Exact rupiah values fit Kogol cards on mobile');
    await page.locator('.lpb-overview').scrollIntoViewIfNeeded();
    await page.locator('.lpb-overview').screenshot({ path: path.join(qa, 'lpb-dashboard-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'LPB dashboard fits mobile viewport');
    await page.locator('.lpb-overview [data-tab="lpb"]').click();
    assert.equal(await page.evaluate(() => state.activeTab), 'lpb');
    await page.evaluate(() => switchTab('upload'));
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.remove('is-menu-collapsed'));
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(qa, 'kogol-upload-compact-desktop.png'), fullPage: true });
    const uploadInsets = await page.evaluate(() => {
      const panel = document.querySelector('[data-tab-panel="upload"]');
      const style = getComputedStyle(panel);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
    });
    assert.ok(Math.abs(uploadInsets.left - 32) < 1, `Upload Database memakai jarak kiri dashboard (${JSON.stringify(uploadInsets)})`);
    assert.ok(Math.abs(uploadInsets.right - 32) < 1, `Upload Database memakai jarak kanan dashboard (${JSON.stringify(uploadInsets)})`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.add('is-menu-collapsed'));
    await page.screenshot({ path: path.join(qa, 'kogol-upload-mobile.png'), fullPage: true });
    assert.equal(await page.locator('[data-tab-panel="upload"] .upload-panel:visible').count(), 7);
    assert.equal(await page.locator('#standAwalInput').count(), 1);
    assert.equal(await page.locator('#standAkhirInput').count(), 1);
    assert.equal(await page.getByText('Upload Stand Awal', { exact: true }).isVisible(), false, 'Upload Data does not include stand uploads');
    assert.equal(await page.getByText('Upload Stand Akhir', { exact: true }).isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No full-page horizontal overflow on mobile');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.remove('is-menu-collapsed'));
    const databaseGroup = page.locator('[data-tree-toggle="database"]').locator('..');
    if (!await databaseGroup.evaluate((group) => group.classList.contains('is-open'))) {
      await page.locator('[data-tree-toggle="database"]').click();
    }
    const standMenu = databaseGroup.getByRole('button', { name: 'Upload Stand', exact: true });
    const dataMenu = databaseGroup.getByRole('button', { name: 'Upload Data', exact: true });
    assert.equal(await page.locator('[data-tree-toggle="simontok-app"]').locator('..').getByRole('button', { name: 'Upload Stand', exact: true }).count(), 0);
    await standMenu.click();
    assert.equal(await page.locator('#workspaceTabTitle').textContent(), 'Upload Stand');
    assert.equal(await standMenu.getAttribute('aria-selected'), 'true');
    assert.equal(await dataMenu.getAttribute('aria-selected'), 'false');
    assert.equal(await page.locator('[data-tab-panel="upload"] .upload-panel:visible').count(), 2);
    assert.equal(await page.getByText('Upload Stand Awal', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Upload Stand Akhir', { exact: true }).isVisible(), true);
    await page.evaluate(() => {
      state.struk = [{ idpel: '001', standAwal: '123', standAkhir: '456' }];
      state.uploadMeta.standAwal = { uploadedAt: '2026-11-06T02:00:00Z' };
      state.uploadMeta.standAkhir = { uploadedAt: '2026-11-06T02:05:00Z' };
      updateFileStatuses();
    });
    assert.match(await page.locator('#standAwalStatus').innerText(), /1 IDPEL tersimpan/i);
    assert.match(await page.locator('#standAkhirStatus').innerText(), /Terakhir upload/i);
    const standCards = await page.locator('.stand-upload-layout .upload-panel').evaluateAll((cards) => cards.map((card) => {
      const rect = card.getBoundingClientRect();
      const text = card.querySelector('div').getBoundingClientRect();
      const button = card.querySelector('.file-button').getBoundingClientRect();
      const status = card.querySelector('.file-status').getBoundingClientRect();
      return { top: rect.top, width: rect.width, height: rect.height, buttonRightOfText: button.left >= text.right, statusBelowButton: status.top >= button.bottom };
    }));
    assert.equal(standCards[0].top, standCards[1].top, 'Desktop stand cards are side by side');
    assert.equal(standCards[0].width, standCards[1].width);
    assert.equal(standCards.every((card) => card.height < 200 && card.buttonRightOfText && card.statusBelowButton), true, 'Stand uploads use the compact Kogol card layout');
    await page.locator('#uploadPanelTitle').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'stand-upload-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.add('is-menu-collapsed'));
    await page.screenshot({ path: path.join(qa, 'stand-upload-mobile.png'), fullPage: true });
    assert.equal(await page.locator('[data-tab-panel="upload"] .upload-panel:visible').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Stand upload fits the mobile viewport');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.remove('is-menu-collapsed'));
    await dataMenu.click();
    assert.equal(await page.locator('#workspaceTabTitle').textContent(), 'Upload Data');
    assert.equal(await dataMenu.getAttribute('aria-selected'), 'true');
    assert.equal(await standMenu.getAttribute('aria-selected'), 'false');
    assert.equal(await page.locator('[data-tab-panel="upload"] .upload-panel:visible').count(), 7);
    await page.evaluate(() => {
      state.profile.role = 'petugas';
      switchTab('laporan');
      state.profile.role = 'admin';
      updateHeaderActions();
    });
    assert.equal(await page.locator('[data-tab-panel="laporan"] > .section-head').count(), 0, 'Kartu judul laporan dihapus');
    assert.equal(await page.locator('[data-tab-panel="laporan"] > .summary-grid').count(), 0, 'Kartu ringkasan laporan dihapus');
    assert.equal(await page.locator('[data-tab-panel="laporan"] .section-head #exportButton').count(), 0, 'Ekspor tidak lagi berada di header');
    assert.equal(await page.locator('.report-bottom-toolbar #sortSelect').isVisible(), true, 'Urutan tersedia di bawah tabel');
    assert.equal(await page.locator('.report-bottom-toolbar #exportJpgButton').isVisible(), true, 'Ekspor JPG tersedia di bawah tabel');
    assert.equal(await page.locator('.report-bottom-toolbar #exportButton').isVisible(), true, 'Ekspor Excel tersedia di bawah tabel');
    const reportLayout = await page.evaluate(() => {
      const table = document.querySelector('[data-tab-panel="laporan"] .table-section').getBoundingClientRect();
      const controls = document.querySelector('.report-bottom-toolbar').getBoundingClientRect();
      return { tableTop: table.top, tableBottom: table.bottom, controlsTop: controls.top };
    });
    assert.ok(reportLayout.tableTop < reportLayout.controlsTop && reportLayout.tableBottom <= reportLayout.controlsTop, 'Tabel berada di atas kontrol laporan');
    const stickyHeaderGeometry = await page.evaluate(async () => {
      const wrap = document.querySelector('[data-tab-panel="laporan"] .table-wrap');
      const body = document.querySelector('#monitoringTable tbody');
      window.__monitoringBodyBeforeStickyTest = body.innerHTML;
      body.innerHTML = Array.from({ length: 36 }, (_, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>PETUGAS ${index + 1}</td>
          <td>1.000</td>
          <td>Rp 100.000.000</td>
          <td>100</td>
          <td>Rp 10.000.000</td>
          <td>900</td>
          <td>Rp 90.000.000</td>
          <td>90%</td>
          <td>90%</td>
        </tr>
      `).join('');
      wrap.scrollTop = 120;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const firstRowCell = document.querySelector('#monitoringTable thead tr:first-child th[colspan]');
      const secondRowCell = document.querySelector('#monitoringTable thead tr:nth-child(2) th');
      const firstRect = firstRowCell.getBoundingClientRect();
      const secondRect = secondRowCell.getBoundingClientRect();
      const firstBackground = getComputedStyle(firstRowCell).backgroundColor;
      const secondBackground = getComputedStyle(secondRowCell).backgroundColor;
      return {
        gap: secondRect.top - firstRect.bottom,
        firstBackground,
        secondBackground,
      };
    });
    assert.ok(Math.abs(stickyHeaderGeometry.gap) <= 1, `Dua baris header sticky harus rapat, gap ${stickyHeaderGeometry.gap}px`);
    assert.notEqual(stickyHeaderGeometry.firstBackground, 'rgba(0, 0, 0, 0)', 'Header pertama memiliki latar solid');
    assert.notEqual(stickyHeaderGeometry.secondBackground, 'rgba(0, 0, 0, 0)', 'Header kedua memiliki latar solid');
    await page.locator('[data-tab-panel="laporan"] .table-wrap').screenshot({ path: path.join(qa, 'monitoring-report-sticky-header.png') });
    await page.evaluate(() => {
      const wrap = document.querySelector('[data-tab-panel="laporan"] .table-wrap');
      wrap.scrollTop = 0;
      document.querySelector('#monitoringTable tbody').innerHTML = window.__monitoringBodyBeforeStickyTest;
      delete window.__monitoringBodyBeforeStickyTest;
    });
    await page.screenshot({ path: path.join(qa, 'monitoring-report-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.add('is-menu-collapsed'));
    await page.screenshot({ path: path.join(qa, 'monitoring-report-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Laporan monitoring tidak overflow pada mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => document.querySelector('.workspace-layout').classList.remove('is-menu-collapsed'));
    await standMenu.click();
    await page.evaluate(() => {
      state.profile.role = 'petugas';
      applyRoleView();
      switchTab('upload');
    });
    assert.equal(await standMenu.isVisible(), false, 'Stand submenu stays hidden for officers');
    assert.equal(await page.getByText('Upload Stand Awal', { exact: true }).isVisible(), false, 'Opening stand upload stays hidden for officers');
    assert.equal(await page.getByText('Upload Stand Akhir', { exact: true }).isVisible(), false, 'Closing stand upload stays hidden for officers');
    assert.deepEqual(errors, []);
    console.log('PASS Kogol dashboard UI: four charts, Kogol 0 drilldown, classification, save RPC and responsive layout');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
