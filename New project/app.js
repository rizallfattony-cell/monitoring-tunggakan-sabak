const STORE_NAME = "monitoringSaldoTunggakan";
const DB_NAME = "monitoring-saldo-db";
const DB_VERSION = 1;
const CLOUD_STATE_ID = "main";
const SALDO_AVERAGE_FIELDS = [
  { key: "kogol0Berjalan", label: "KOGOL 0 Berjalan" },
  { key: "kogol0Tunggakan", label: "KOGOL 0 Tunggakan" },
  { key: "kogol3Perkantoran", label: "KOGOL 3 Perkantoran" },
  { key: "kogol3Pju", label: "KOGOL 3 PJU" },
  { key: "kogol4", label: "KOGOL 4" },
];
const COMPARISON_KOLOK_KEYS = ["A", "B", "C", "D", "E", "F", "G", "J"];
const WORK_MOTIVATION_QUOTES = [
  "Kerja yang rapi hari ini membuat masalah besok jauh lebih ringan.",
  "Disiplin kecil yang dilakukan konsisten akan mengalahkan semangat besar yang hanya sesekali.",
  "Data yang tertib adalah awal dari keputusan yang tepat.",
  "Fokus pada pekerjaan yang bisa diselesaikan hari ini, lalu tuntaskan dengan hati tenang.",
  "Pelayanan yang baik dimulai dari pekerjaan yang dicatat dengan benar.",
  "Jangan menunggu semua mudah; mulai dari yang paling penting dan bergerak pelan tapi pasti.",
  "Kualitas kerja terlihat dari hal kecil yang tetap dikerjakan dengan sungguh-sungguh.",
  "Target besar menjadi dekat ketika pekerjaan harian tidak ditunda.",
  "Orang yang teliti bukan yang tidak pernah salah, tetapi yang mau memeriksa sebelum selesai.",
  "Hari kerja yang baik dimulai dari niat yang jelas dan data yang siap.",
  "Semangat boleh naik turun, tetapi tanggung jawab harus tetap jalan.",
  "Satu laporan yang akurat bisa membantu banyak keputusan menjadi lebih baik.",
  "Bekerja cepat itu baik, bekerja benar jauh lebih penting.",
  "Jaga ritme, jaga fokus, dan selesaikan satu pekerjaan sampai tuntas.",
  "Setiap data yang diperbarui adalah bagian kecil dari pelayanan yang lebih besar.",
];

const state = {
  dil: [],
  awal: [],
  akhir: [],
  struk: [],
  uploadMeta: {},
  report: [],
  totals: emptyTotals(),
  anomalies: [],
  remainingByPetugas: new Map(),
  pendingExport: null,
  activeTab: "overview",
  uploadView: "database",
  supabaseClient: null,
  user: null,
  profile: null,
  premiumRequests: [],
  saldoAkhirRataRata: emptySaldoAverageState(),
  dailyPelunasan: emptyDailyPelunasanState(),
  comparisonMonitoring: emptyComparisonMonitoringState(),
  saldoAverageSaveTimer: null,
  dailyPelunasanSaveTimer: null,
  comparisonMonitoringSaveTimer: null,
};

const els = {
  appShell: document.querySelector("#appShell"),
  authGate: document.querySelector("#authGate"),
  gateEmailInput: document.querySelector("#gateEmailInput"),
  gatePasswordInput: document.querySelector("#gatePasswordInput"),
  gateLoginButton: document.querySelector("#gateLoginButton"),
  gateLoginStatus: document.querySelector("#gateLoginStatus"),
  dilInput: document.querySelector("#dilInput"),
  awalInput: document.querySelector("#awalInput"),
  akhirInput: document.querySelector("#akhirInput"),
  strukInput: document.querySelector("#strukInput"),
  dilStatus: document.querySelector("#dilStatus"),
  awalStatus: document.querySelector("#awalStatus"),
  akhirStatus: document.querySelector("#akhirStatus"),
  strukStatus: document.querySelector("#strukStatus"),
  tableBody: document.querySelector("#tableBody"),
  tableFoot: document.querySelector("#tableFoot"),
  tableDate: document.querySelector("#tableDate"),
  reportDate: document.querySelector("#reportDate"),
  overviewQuote: document.querySelector("#overviewQuote"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  exportButton: document.querySelector("#exportButton"),
  exportJpgButton: document.querySelector("#exportJpgButton"),
  resetButton: document.querySelector("#resetButton"),
  onlineButton: document.querySelector("#onlineButton"),
  onlinePanel: document.querySelector("#onlinePanel"),
  onlineStatus: document.querySelector("#onlineStatus"),
  progressPanel: document.querySelector("#progressPanel"),
  progressTitle: document.querySelector("#progressTitle"),
  progressPercent: document.querySelector("#progressPercent"),
  progressFill: document.querySelector("#progressFill"),
  progressText: document.querySelector("#progressText"),
  uploadPanelTitle: document.querySelector("#uploadPanelTitle"),
  uploadPanelDescription: document.querySelector("#uploadPanelDescription"),
  uploadPanels: [...document.querySelectorAll("[data-upload-panel]")],
  premiumPanel: document.querySelector("#premiumPanel"),
  premiumStatus: document.querySelector("#premiumStatus"),
  premiumList: document.querySelector("#premiumList"),
  refreshPremiumButton: document.querySelector("#refreshPremiumButton"),
  togglePremiumButton: document.querySelector("#togglePremiumButton"),
  loginForm: document.querySelector("#loginForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  loginButton: document.querySelector("#loginButton"),
  syncActions: document.querySelector("#syncActions"),
  loadCloudButton: document.querySelector("#loadCloudButton"),
  saveCloudButton: document.querySelector("#saveCloudButton"),
  logoutButton: document.querySelector("#logoutButton"),
  exportModal: document.querySelector("#exportModal"),
  exportModalTitle: document.querySelector("#exportModalTitle"),
  exportModalSubtitle: document.querySelector("#exportModalSubtitle"),
  exportModalBody: document.querySelector("#exportModalBody"),
  closeModalButton: document.querySelector("#closeModalButton"),
  cancelExportButton: document.querySelector("#cancelExportButton"),
  confirmExportButton: document.querySelector("#confirmExportButton"),
  anomalyToggle: document.querySelector("#anomalyToggle"),
  anomalyBody: document.querySelector("#anomalyBody"),
  anomalyList: document.querySelector("#anomalyList"),
  anomalyCount: document.querySelector("#anomalyCount"),
  metricAwal: document.querySelector("#metricAwal"),
  metricAkhir: document.querySelector("#metricAkhir"),
  metricPelunasan: document.querySelector("#metricPelunasan"),
  metricPersen: document.querySelector("#metricPersen"),
  uploadGrid: document.querySelector(".upload-grid"),
  summaryGrid: document.querySelector(".summary-grid"),
  toolbar: document.querySelector(".toolbar"),
  anomalySection: document.querySelector(".anomaly-section"),
  saldoAverageAwalFields: document.querySelector('[data-saldo-group="awal"]'),
  saldoAverageAkhirFields: document.querySelector('[data-saldo-group="akhir"]'),
  saldoAverageTarget: document.querySelector("#saldoAverageTarget"),
  saldoAverageAwalTotal: document.querySelector("#saldoAverageAwalTotal"),
  saldoAverageAkhirTotal: document.querySelector("#saldoAverageAkhirTotal"),
  saldoAverageCurrent: document.querySelector("#saldoAverageCurrent"),
  saldoAverageGap: document.querySelector("#saldoAverageGap"),
  saldoAverageReportText: document.querySelector("#saldoAverageReportText"),
  copySaldoAverageButton: document.querySelector("#copySaldoAverageButton"),
  useEndingAsBeginningButton: document.querySelector("#useEndingAsBeginningButton"),
  saldoAverageCopyStatus: document.querySelector("#saldoAverageCopyStatus"),
  dailyMonthInput: document.querySelector("#dailyMonthInput"),
  dailyDateSelect: document.querySelector("#dailyDateSelect"),
  dailySaldoInput: document.querySelector("#dailySaldoInput"),
  dailyStatus: document.querySelector("#dailyStatus"),
  dailyTableDate: document.querySelector("#dailyTableDate"),
  dailyTableHead: document.querySelector("#dailyTableHead"),
  dailyTableBody: document.querySelector("#dailyTableBody"),
  undoDailyUploadButton: document.querySelector("#undoDailyUploadButton"),
  exportDailyExcelTopButton: document.querySelector("#exportDailyExcelTopButton"),
  exportDailyJpgTopButton: document.querySelector("#exportDailyJpgTopButton"),
  comparisonMonthInput: document.querySelector("#comparisonMonthInput"),
  comparisonDailyAwalDateSelect: document.querySelector("#comparisonDailyAwalDateSelect"),
  comparisonDailyAkhirDateSelect: document.querySelector("#comparisonDailyAkhirDateSelect"),
  comparisonLastMonthDateSelect: document.querySelector("#comparisonLastMonthDateSelect"),
  comparisonDailyAwalInput: document.querySelector("#comparisonDailyAwalInput"),
  comparisonDailyAkhirInput: document.querySelector("#comparisonDailyAkhirInput"),
  comparisonLastMonthInput: document.querySelector("#comparisonLastMonthInput"),
  comparisonDailyAwalStatus: document.querySelector("#comparisonDailyAwalStatus"),
  comparisonDailyAkhirStatus: document.querySelector("#comparisonDailyAkhirStatus"),
  comparisonLastMonthStatus: document.querySelector("#comparisonLastMonthStatus"),
  comparisonTableHead: document.querySelector("#comparisonTableHead"),
  comparisonTableBody: document.querySelector("#comparisonTableBody"),
  comparisonTableFoot: document.querySelector("#comparisonTableFoot"),
  comparisonTableDate: document.querySelector("#comparisonTableDate"),
  exportComparisonExcelButton: document.querySelector("#exportComparisonExcelButton"),
  exportComparisonJpgButton: document.querySelector("#exportComparisonJpgButton"),
  invoiceForm: document.querySelector("#invoiceForm"),
  invoiceIdpel: document.querySelector("#invoiceIdpel"),
  invoiceNama: document.querySelector("#invoiceNama"),
  invoiceKodeKedudukan: document.querySelector("#invoiceKodeKedudukan"),
  invoiceAlamat: document.querySelector("#invoiceAlamat"),
  invoiceTarif: document.querySelector("#invoiceTarif"),
  invoiceDaya: document.querySelector("#invoiceDaya"),
  invoiceRekening: document.querySelector("#invoiceRekening"),
  invoiceKota: document.querySelector("#invoiceKota"),
  invoiceTagihan: document.querySelector("#invoiceTagihan"),
  invoiceTerlambat: document.querySelector("#invoiceTerlambat"),
  invoiceManager: document.querySelector("#invoiceManager"),
  invoiceStatus: document.querySelector("#invoiceStatus"),
  invoicePreviewText: document.querySelector("#invoicePreviewText"),
  refreshInvoicePreviewButton: document.querySelector("#refreshInvoicePreviewButton"),
  printInvoiceButton: document.querySelector("#printInvoiceButton"),
  loadInvoiceCustomerButton: document.querySelector("#loadInvoiceCustomerButton"),
  workspaceTabTitle: document.querySelector("#workspaceTabTitle"),
  treeToggleButtons: [...document.querySelectorAll("[data-tree-toggle]")],
  adminOnlyMenus: [...document.querySelectorAll(".admin-only-menu")],
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")],
};

boot();

async function boot() {
  if (els.sortSelect) els.sortSelect.value = "persenDesc";
  setReportDate();
  renderSaldoAverageInputs();
  initializeDailyPelunasanControls();
  initializeInvoiceForm();
  attachEvents();
  initSupabase();
  await hydrate();
  await hydrateSession();
  syncDailyUndoButton();
  if (state.profile?.role === "petugas") {
    await loadPetugasData();
  } else {
    if (state.profile?.role === "admin") {
      await loadPremiumRequests();
      await loadCloudData({ silentIfEmpty: true, automatic: true });
    } else {
      recompute();
    }
  }
}

function initializeInvoiceForm() {
  if (!els.invoiceForm) return;
  if (els.invoiceRekening && !els.invoiceRekening.value) {
    els.invoiceRekening.value = formatInvoiceMonth(new Date());
  }
  renderInvoicePreview();
}

function attachEvents() {
  els.dilInput.addEventListener("change", (event) => handleUpload(event, "dil"));
  els.awalInput.addEventListener("change", (event) => handleUpload(event, "awal"));
  els.akhirInput.addEventListener("change", (event) => handleUpload(event, "akhir"));
  els.strukInput.addEventListener("change", handleStrukUpload);
  els.searchInput.addEventListener("input", render);
  els.sortSelect.addEventListener("change", render);
  els.exportButton.addEventListener("click", exportReport);
  els.exportJpgButton?.addEventListener("click", exportReportJpg);
  els.resetButton.addEventListener("click", resetData);
  els.onlineButton.addEventListener("click", () => {
    switchTab("online");
    openOnlinePanel();
  });
  els.gateLoginButton?.addEventListener("click", () => loginOnline("gate"));
  els.gatePasswordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginOnline("gate");
  });
  els.loginButton.addEventListener("click", () => loginOnline("panel"));
  els.logoutButton.addEventListener("click", logoutOnline);
  els.loadCloudButton.addEventListener("click", loadCloudData);
  els.saveCloudButton.addEventListener("click", saveCloudData);
  els.refreshPremiumButton?.addEventListener("click", loadPremiumRequests);
  els.togglePremiumButton?.addEventListener("click", togglePremiumPanel);
  els.premiumList?.addEventListener("click", handlePremiumClick);
  els.tableBody.addEventListener("click", handleCountClick);
  els.tableFoot.addEventListener("click", handleCountClick);
  els.closeModalButton.addEventListener("click", closeExportModal);
  els.cancelExportButton.addEventListener("click", closeExportModal);
  els.confirmExportButton.addEventListener("click", confirmPendingExport);
  els.exportModal.addEventListener("click", (event) => {
    if (event.target === els.exportModal) closeExportModal();
  });
  els.anomalyToggle.addEventListener("click", () => {
    els.anomalyBody.hidden = !els.anomalyBody.hidden;
  });
  els.saldoAverageAwalFields?.addEventListener("input", handleSaldoAverageInput);
  els.saldoAverageAkhirFields?.addEventListener("input", handleSaldoAverageInput);
  els.saldoAverageTarget?.addEventListener("input", handleSaldoAverageInput);
  els.copySaldoAverageButton?.addEventListener("click", copySaldoAverageReport);
  els.useEndingAsBeginningButton?.addEventListener("click", useEndingSaldoAsBeginning);
  els.dailyMonthInput?.addEventListener("change", handleDailyMonthChange);
  els.dailyDateSelect?.addEventListener("change", handleDailyDateChange);
  els.dailySaldoInput?.addEventListener("change", handleDailySaldoUpload);
  els.undoDailyUploadButton?.addEventListener("click", undoDailyPelunasanUpload);
  els.exportDailyExcelTopButton?.addEventListener("click", exportDailyPelunasanExcel);
  els.exportDailyJpgTopButton?.addEventListener("click", exportDailyPelunasanJpg);
  els.comparisonMonthInput?.addEventListener("change", handleComparisonMonthChange);
  els.comparisonDailyAwalDateSelect?.addEventListener("change", (event) => handleComparisonDateChange(event, "selectedDailyAwalDate"));
  els.comparisonDailyAkhirDateSelect?.addEventListener("change", (event) => handleComparisonDateChange(event, "selectedDailyAkhirDate"));
  els.comparisonLastMonthDateSelect?.addEventListener("change", (event) => handleComparisonDateChange(event, "selectedLastMonthDate"));
  els.comparisonDailyAwalInput?.addEventListener("change", (event) => handleComparisonUpload(event, "dailyAwal"));
  els.comparisonDailyAkhirInput?.addEventListener("change", (event) => handleComparisonUpload(event, "dailyAkhir"));
  els.comparisonLastMonthInput?.addEventListener("change", (event) => handleComparisonUpload(event, "lastMonth"));
  els.exportComparisonExcelButton?.addEventListener("click", exportComparisonMonitoringExcel);
  els.exportComparisonJpgButton?.addEventListener("click", exportComparisonMonitoringJpg);
  els.dailyTableBody?.addEventListener("click", handleDailyDetailClick);
  els.invoiceForm?.addEventListener("input", renderInvoicePreview);
  els.refreshInvoicePreviewButton?.addEventListener("click", renderInvoicePreview);
  els.printInvoiceButton?.addEventListener("click", printInvoice);
  els.loadInvoiceCustomerButton?.addEventListener("click", loadInvoiceCustomer);
  els.invoiceIdpel?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadInvoiceCustomer();
    }
  });
  els.treeToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.closest(".tree-group");
      group?.classList.toggle("is-open");
    });
  });
  els.tabButtons.forEach((button) => {
    if (button.hasAttribute("data-tree-toggle")) return;
    button.addEventListener("click", () => {
      if (button.dataset.uploadView) setUploadView(button.dataset.uploadView);
      switchTab(button.dataset.tab);
    });
  });
  initializeTableMaximizeButtons();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMaximizedTable();
  });
}

function initializeTableMaximizeButtons() {
  document.querySelectorAll(".table-section").forEach((section) => {
    const heading = section.querySelector(".report-heading");
    if (!heading || heading.querySelector("[data-table-maximize]")) return;
    let actions = heading.querySelector(".daily-report-actions, .table-heading-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "table-heading-actions";
      heading.appendChild(actions);
    }
    const button = document.createElement("button");
    button.className = "button secondary table-maximize-button";
    button.type = "button";
    button.dataset.tableMaximize = "true";
    button.textContent = "Maximize";
    button.addEventListener("click", () => toggleTableMaximize(section));
    actions.prepend(button);
  });
}

function toggleTableMaximize(section) {
  const isActive = section.classList.contains("is-maximized");
  closeMaximizedTable();
  if (isActive) return;
  section.classList.add("is-maximized");
  document.body.classList.add("table-maximize-open");
  updateMaximizeButton(section, true);
}

function closeMaximizedTable() {
  document.querySelectorAll(".table-section.is-maximized").forEach((section) => {
    section.classList.remove("is-maximized");
    updateMaximizeButton(section, false);
  });
  document.body.classList.remove("table-maximize-open");
}

function updateMaximizeButton(section, active) {
  const button = section.querySelector("[data-table-maximize]");
  if (!button) return;
  button.textContent = active ? "Tutup Maximize" : "Maximize";
}

function switchTab(tabName) {
  if (!tabName) return;
  state.activeTab = tabName;
  els.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    const isRepeatedSubMenu = button.classList.contains("tree-child");
    const isOverviewCard = button.classList.contains("overview-card");
    const shouldHighlight = active && !isOverviewCard && (!isRepeatedSubMenu || document.activeElement === button);
    button.classList.toggle("is-active", shouldHighlight);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.treeToggleButtons.forEach((button) => {
    const group = button.closest(".tree-group");
    const active = Boolean(group?.querySelector(".tree-child.is-active"));
    button.classList.toggle("is-active", active);
    if (active) group?.classList.add("is-open");
  });
  els.tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabName;
    panel.classList.toggle("is-active", panel.dataset.tabPanel === tabName);
  });
  if (els.workspaceTabTitle) els.workspaceTabTitle.textContent = tabTitle(tabName);
  if (tabName === "upload") renderUploadView();
  updateHeaderActions();
}

function setUploadView(viewName) {
  state.uploadView = viewName === "stand-meter" ? "stand-meter" : "database";
}

function renderUploadView() {
  const standMeterOnly = state.uploadView === "stand-meter";
  els.uploadPanels.forEach((panel) => {
    panel.hidden = standMeterOnly
      ? panel.dataset.uploadPanel !== "stand-meter"
      : panel.dataset.uploadPanel !== "database";
  });
  if (els.uploadPanelTitle) {
    els.uploadPanelTitle.textContent = standMeterOnly ? "Upload Stand Meter" : "UPLOAD DATABASE";
  }
  if (els.uploadPanelDescription) {
    els.uploadPanelDescription.textContent = standMeterOnly
      ? "Upload stand meter untuk kebutuhan struk petugas di aplikasi SIMONTOK."
      : "Silahkan Upload Data Exel Anda Sesuai Format yang berlaku.";
  }
}

function tabTitle(tabName) {
  const titles = {
    overview: "Overview",
    upload: "Upload Data",
    laporan: "Laporan",
    "pelunasan-harian": "Pelunasan Harian",
    comparison: "Perbandingan Saldo Dengan Bulan Lalu",
    "saldo-rata": "Saldo Akhir Rata Rata",
    online: "Online & Sinkron",
    invoice: "Cetak Invoice",
    premium: "Premium",
  };
  return titles[tabName] || "Overview";
}

function loadInvoiceCustomer() {
  const idpel = normalizeId(els.invoiceIdpel?.value);
  if (!idpel) {
    setInvoiceStatus("Isi ID Pelanggan terlebih dahulu.");
    return;
  }
  const customer = findInvoiceCustomer(idpel);
  if (!customer) {
    setInvoiceStatus(`IDPEL ${idpel} belum ditemukan di data upload. Silakan isi manual.`);
    renderInvoicePreview();
    return;
  }
  if (els.invoiceNama) els.invoiceNama.value = customer.nama || "";
  if (els.invoiceAlamat) els.invoiceAlamat.value = customer.alamat || "";
  if (els.invoiceTarif) els.invoiceTarif.value = customer.tarif || "";
  if (els.invoiceDaya) els.invoiceDaya.value = customer.daya || "";
  if (els.invoiceKodeKedudukan) els.invoiceKodeKedudukan.value = customer.koked || "";
  if (els.invoiceTagihan) els.invoiceTagihan.value = customer.rupiah ? formatIntegerInput(customer.rupiah) : "";
  if (els.invoiceTerlambat && !els.invoiceTerlambat.value) els.invoiceTerlambat.value = "0";
  setInvoiceStatus(`Data IDPEL ${idpel} berhasil dimuat ke invoice.`);
  renderInvoicePreview();
}

function findInvoiceCustomer(idpel) {
  const key = normalizeId(idpel);
  const saldo = [...state.akhir, ...state.awal].find((row) => normalizeId(row.idpel) === key);
  const dil = state.dil.find((row) => normalizeId(row.idpel) === key);
  if (!saldo && !dil) return null;
  return {
    idpel: key,
    nama: saldo?.nama || dil?.nama || "",
    alamat: saldo?.alamat || "",
    tarif: saldo?.tarif || "",
    daya: saldo?.daya || "",
    koked: saldo?.koked || dil?.koked || "",
    kolok: saldo?.kolok || dil?.kolok || "",
    rupiah: Number(saldo?.rupiah || saldo?.rptag || 0),
  };
}

function renderInvoicePreview() {
  if (!els.invoicePreviewText) return;
  els.invoicePreviewText.textContent = buildInvoiceText(readInvoiceForm());
}

function readInvoiceForm() {
  const tagihan = parseFlexibleRupiah(els.invoiceTagihan?.value || 0);
  const terlambat = parseFlexibleRupiah(els.invoiceTerlambat?.value || 0);
  return {
    idpel: cleanText(els.invoiceIdpel?.value || ""),
    nama: cleanText(els.invoiceNama?.value || ""),
    kodeKedudukan: cleanText(els.invoiceKodeKedudukan?.value || ""),
    alamat: cleanText(els.invoiceAlamat?.value || ""),
    tarif: cleanText(els.invoiceTarif?.value || ""),
    daya: cleanText(els.invoiceDaya?.value || ""),
    rekening: cleanText(els.invoiceRekening?.value || formatInvoiceMonth(new Date())).toUpperCase(),
    kota: cleanText(els.invoiceKota?.value || "Sabak"),
    tagihan,
    terlambat,
    total: tagihan + terlambat,
    manager: cleanText(els.invoiceManager?.value || "MARWAN MASALAN").toUpperCase(),
  };
}

function buildInvoiceText(data) {
  const width = 95;
  const rpX = 68;
  const rightValueWidth = 15;
  const lines = [
    "PT. PLN (PERSERO) UID S2JB",
    "UP3 JAMBI",
    "ULP SABAK",
    "",
    centerInvoiceText("AYO BAYAR LISTRIK DI AWAL BULAN", width),
    "          " + "-".repeat(70),
    "Kepada Yth.",
    invoiceTwoColumn("Nama", data.nama, "", "", width),
    invoiceTwoColumn("ID Pelanggan", data.idpel, "Kode kedudukan", data.kodeKedudukan, width),
    invoiceTwoColumn("Alamat", data.alamat, "", "", width),
    invoiceTwoColumn("Tarip / daya", [data.tarif, data.daya].filter(Boolean).join("/"), "", "", width),
    invoiceMoneyLine("Rekening", data.rekening, data.tagihan, rpX, rightValueWidth),
    invoiceMoneyLine("Jumlah Biaya Keterlambatan s.d bulan", "", data.terlambat, rpX, rightValueWidth),
    invoiceMoneyLine("Jumlah Tagihan ( belum termasuk biaya Administrasi )", "", data.total, rpX, rightValueWidth, true),
    "",
    "",
    ...wrapInvoiceParagraph("Dengan ini kami informasikan tagihan listrik saudara/i sesuai dengan data di atas. Kami menghimbau agar dapat melunasi tagihan rekening listrik sebelum tanggal 20 setiap bulannya dan bila telat dari tempo yang sudah di tentukan maka akan kami lakukan pemutusan sementara dan migrasi ke KWH Prabayar. Terimakasih bagi pelanggan yang sudah tepat waktu,selamat menikmati aliran listrik.\"SALAM LISTRIK UNTUK KEHIDUPAN YANG LEBIH BAIK\".", width),
    "",
    "          BUKTI PENGANTAR",
    "------------------------------------------------",
    invoiceDottedLine("Nama Penerima", 30),
    "",
    invoiceDottedLine("No. HP Pelanggan", 30),
    "",
    invoiceDottedLine("Komitmen Bayar", 30),
    "",
    invoiceDottedLine("Tanda Tangan", 30),
    "------------------------------------------------",
    padInvoice("", 58) + `${data.kota},`.padEnd(18) + data.rekening,
    padInvoice("", 78) + "Manager",
    "",
    "",
    "",
    padInvoice("", 74) + data.manager,
    centerInvoiceText('"ABAIKAN PEMBERITAHUAN INI JIKA SUDAH MEMBAYAR TAGIHAN"', width),
  ];
  return lines.join("\n");
}

function invoiceTwoColumn(label, value, rightLabel, rightValue, width) {
  const left = `${label.padEnd(13)}: ${value || ""}`;
  if (!rightLabel) return left;
  const right = `${rightLabel} : ${rightValue || ""}`;
  return left.padEnd(Math.max(54, width - right.length)) + right;
}

function invoiceMoneyLine(label, value, amount, rpX, rightValueWidth, bold = false) {
  const left = value ? `${label.padEnd(13)}: ${value}` : `${label} :`;
  const amountText = formatInvoiceMoney(amount);
  const line = left.padEnd(rpX) + "Rp:" + amountText.padStart(rightValueWidth);
  return bold ? line : line;
}

function invoiceDottedLine(label, length) {
  return `${label.padEnd(17)}: ${".".repeat(length)}`;
}

function wrapInvoiceParagraph(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function centerInvoiceText(text, width) {
  const value = String(text || "");
  const left = Math.max(0, Math.floor((width - value.length) / 2));
  return `${" ".repeat(left)}${value}`;
}

function padInvoice(text, width) {
  return String(text || "").padEnd(width);
}

function formatInvoiceMoney(value) {
  return formatNumber(Math.round(Number(value || 0)));
}

function formatInvoiceMonth(value) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(value).toUpperCase();
}

function printInvoice() {
  renderInvoicePreview();
  document.body.classList.add("invoice-printing");
  window.setTimeout(() => window.print(), 100);
  window.setTimeout(() => document.body.classList.remove("invoice-printing"), 1200);
}

function setInvoiceStatus(message) {
  if (els.invoiceStatus) els.invoiceStatus.textContent = message;
}

async function hydrate() {
  const saved = await getStoredData();
  state.dil = saved.dil || [];
  state.awal = saved.awal || [];
  state.akhir = saved.akhir || [];
  state.struk = saved.struk || [];
  state.uploadMeta = normalizeUploadMeta(saved.uploadMeta);
  state.saldoAkhirRataRata = normalizeSaldoAverageState(saved.saldoAkhirRataRata);
  state.dailyPelunasan = normalizeDailyPelunasanState(saved.dailyPelunasan);
  state.comparisonMonitoring = normalizeComparisonMonitoringState(saved.comparisonMonitoring);
  updateFileStatuses();
  renderSaldoAverage();
  syncDailyPelunasanControls();
  renderDailyPelunasanTable();
  renderComparisonMonitoring();
}

function initSupabase() {
  const config = window.MONITORING_SUPABASE || {};
  if (!config.url || !config.anonKey || !window.supabase?.createClient) {
    setOnlineStatus("Supabase belum dikonfigurasi. Isi supabase-config.js untuk mode online.");
    return;
  }

  state.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  setOnlineStatus("Supabase siap. Silakan login untuk sinkronisasi online.");
}

function openOnlinePanel() {
  els.onlinePanel.hidden = false;
  els.onlinePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function hydrateSession() {
  if (!state.supabaseClient) {
    updateOnlineUi();
    return;
  }

  const { data } = await state.supabaseClient.auth.getSession();
  state.user = data.session?.user || null;
  if (state.user) await loadProfile();
  updateOnlineUi();
}

async function loginOnline(source = "panel") {
  if (!state.supabaseClient) {
    const message = "Supabase belum dikonfigurasi. Isi supabase-config.js terlebih dahulu.";
    setGateStatus(message);
    alert(message);
    return;
  }

  const fields = source === "gate"
    ? { emailInput: els.gateEmailInput, passwordInput: els.gatePasswordInput }
    : { emailInput: els.emailInput, passwordInput: els.passwordInput };
  const email = fields.emailInput?.value.trim() || "";
  const password = fields.passwordInput?.value || "";
  if (!email || !password) {
    const message = "Isi email dan password.";
    setGateStatus(message);
    alert(message);
    return;
  }

  setOnlineStatus("Login...");
  setGateStatus("Login...");
  const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setOnlineStatus(`Login gagal: ${error.message}`);
    setGateStatus(`Login gagal: ${error.message}`);
    return;
  }

  state.user = data.user;
  await loadProfile();
  if (els.passwordInput) els.passwordInput.value = "";
  if (els.gatePasswordInput) els.gatePasswordInput.value = "";
  updateOnlineUi();
  if (state.profile?.role === "petugas") {
    await loadPetugasData();
  } else {
    await loadPremiumRequests();
    await loadCloudData({ silentIfEmpty: true, automatic: true });
  }
}

async function logoutOnline() {
  if (!state.supabaseClient) return;
  await state.supabaseClient.auth.signOut();
  state.user = null;
  state.profile = null;
  state.premiumRequests = [];
  updateOnlineUi();
  renderPremiumRequests();
  recompute();
}

async function loadProfile() {
  if (!state.supabaseClient || !state.user) return;

  const { data, error } = await state.supabaseClient
    .from("monitoring_profiles")
    .select("role, petugas, email, premium_package, premium_active_until")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    setOnlineStatus(`Gagal membaca profil user: ${error.message}`);
    return;
  }

  state.profile = data || null;
}

async function loadCloudData(options = {}) {
  if (!ensureOnlineReady()) return;
  if (state.profile?.role === "petugas") {
    await loadPetugasData();
    return;
  }

  startProgress(options.automatic ? "Memuat Data Online" : "Ambil Data Online", "Mengambil data dari Supabase...");
  setOnlineStatus("Mengambil data online...");
  const { data, error } = await state.supabaseClient
    .from("monitoring_app_state")
    .select("payload, updated_at")
    .eq("id", CLOUD_STATE_ID)
    .maybeSingle();

  if (error) {
    failProgress(`Gagal ambil data online: ${error.message}`);
    setOnlineStatus(`Gagal ambil data online: ${error.message}`);
    return;
  }

  if (!data?.payload) {
    finishProgress(options.silentIfEmpty ? "Login berhasil. Belum ada data online." : "Belum ada data online.");
    setOnlineStatus(options.silentIfEmpty ? "Login berhasil. Belum ada data online." : "Belum ada data online.");
    recompute();
    return;
  }

  updateProgress(45, "Memuat DIL, saldo, dan stand meter...");
  let payload;
  try {
    payload = await decodeCloudPayload(data.payload);
  } catch (error) {
    failProgress(`Gagal membaca data online: ${error.message}`);
    setOnlineStatus(`Gagal membaca data online: ${error.message}`);
    return;
  }
  state.dil = payload.dil || [];
  state.awal = payload.awal || [];
  state.akhir = payload.akhir || [];
  state.struk = payload.struk || [];
  state.uploadMeta = normalizeUploadMeta(payload.uploadMeta);
  state.saldoAkhirRataRata = normalizeSaldoAverageState(payload.saldoAkhirRataRata);
  state.dailyPelunasan = normalizeDailyPelunasanState(payload.dailyPelunasan);
  state.comparisonMonitoring = normalizeComparisonMonitoringState(payload.comparisonMonitoring);
  updateProgress(70, "Menyimpan data ke browser...");
  await saveStoredData();
  updateProgress(85, "Menghitung ulang laporan...");
  recompute();
  renderSaldoAverage();
  syncDailyPelunasanControls();
  syncDailyUndoButton();
  renderDailyPelunasanTable();
  renderComparisonMonitoring();
  finishProgress(`Data online dimuat. Update terakhir: ${formatDateTime(data.updated_at)}.`);
  setOnlineStatus(`Data online dimuat. Update terakhir: ${formatDateTime(data.updated_at)}.`);
}

async function loadPetugasData() {
  if (!ensureOnlineReady()) return;

  setOnlineStatus("Mengambil data tunggakan petugas...");
  const { data, error } = await state.supabaseClient
    .from("monitoring_remaining_customers")
    .select("petugas,idpel,nama,tarif,daya,alamat,lembar,kolok,koked,rptag")
    .eq("report_id", CLOUD_STATE_ID)
    .order("kolok", { ascending: true })
    .order("koked", { ascending: true });

  if (error) {
    setOnlineStatus(`Gagal ambil data petugas: ${error.message}`);
    return;
  }

  renderPetugasRows(data || []);
  setOnlineStatus(`${formatNumber((data || []).length)} pelanggan tersisa dimuat untuk ${state.profile?.petugas || "petugas ini"}.`);
}

async function loadPremiumRequests() {
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") {
    state.premiumRequests = [];
    renderPremiumRequests();
    return;
  }

  if (els.premiumStatus) els.premiumStatus.textContent = "Memuat pengajuan premium...";
  const { data, error } = await state.supabaseClient
    .from("monitoring_premium_requests")
    .select("id,user_id,username,package_code,amount,proof_path,status,created_at,reviewed_at,reviewer_note,request_type,requested_device_id")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (els.premiumStatus) els.premiumStatus.textContent = `Gagal memuat pengajuan: ${error.message}`;
    state.premiumRequests = [];
    renderPremiumRequests();
    return;
  }

  state.premiumRequests = data || [];
  renderPremiumRequests();
}

function renderPremiumRequests() {
  if (!els.premiumList) return;
  const requests = state.premiumRequests || [];
  const pendingCount = requests.filter((row) => row.status === "pending").length;
  if (els.premiumStatus) {
    els.premiumStatus.textContent = state.profile?.role === "admin"
      ? `${formatNumber(pendingCount)} menunggu ACC dari ${formatNumber(requests.length)} pengajuan terakhir.`
      : "Login admin untuk melihat pengajuan premium.";
  }

  if (!requests.length) {
    els.premiumList.innerHTML = `<div class="empty-premium">Belum ada pengajuan premium.</div>`;
    syncPremiumCollapseButton();
    return;
  }

  els.premiumList.innerHTML = requests.map((row) => {
    const pending = row.status === "pending";
    const deviceReset = row.request_type === "device_reset";
    return `
      <article class="premium-card">
        <div>
          <h3>
            ${escapeHtml(row.username || "-")}
            <span class="premium-badge">${deviceReset ? "VERIFIKASI DEVICE" : escapeHtml(row.package_code || "-")}</span>
          </h3>
          <p class="premium-meta">
            ${deviceReset ? "Permintaan ganti device premium" : `Nominal ${formatRupiah(Number(row.amount || 0))}`} - ${premiumStatusLabel(row.status)}
            <br />Upload: ${formatDateTime(row.created_at)}
            ${row.reviewed_at ? `<br />Review: ${formatDateTime(row.reviewed_at)}` : ""}
          </p>
        </div>
        <div class="premium-actions">
          ${deviceReset ? "" : `<button class="button secondary" type="button" data-proof="${escapeHtml(row.proof_path)}">Lihat Bukti</button>`}
          ${deviceReset ? "" : `<select data-package-select="${escapeHtml(row.id)}">
            ${["P1", "P2", "P3"].map((pkg) => `
              <option value="${pkg}" ${row.package_code === pkg ? "selected" : ""}>${pkg} - ${formatRupiah(premiumPackageAmount(pkg))}</option>
            `).join("")}
          </select>
          <button class="button secondary" type="button" data-update-package="${escapeHtml(row.id)}">Ubah Paket</button>`}
          ${pending ? `<button class="button primary" type="button" data-approve="${escapeHtml(row.id)}">${deviceReset ? "ACC Device" : "ACC 30 Hari"}</button>` : ""}
          ${pending ? `<button class="button secondary" type="button" data-reject="${escapeHtml(row.id)}">Tolak</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
  syncPremiumCollapseButton();
}

function togglePremiumPanel() {
  if (!els.premiumPanel) return;
  els.premiumPanel.classList.toggle("is-collapsed");
  syncPremiumCollapseButton();
}

function syncPremiumCollapseButton() {
  if (!els.togglePremiumButton || !els.premiumPanel) return;
  els.togglePremiumButton.textContent = els.premiumPanel.classList.contains("is-collapsed")
    ? "Tampilkan"
    : "Minimize";
}

async function handlePremiumClick(event) {
  const proofPath = event.target?.dataset?.proof;
  const approveId = event.target?.dataset?.approve;
  const rejectId = event.target?.dataset?.reject;
  const updatePackageId = event.target?.dataset?.updatePackage;

  if (proofPath) {
    const { data, error } = await state.supabaseClient.storage
      .from("premium-proofs")
      .createSignedUrl(proofPath, 60 * 5);
    if (error) {
      alert(`Gagal membuka bukti: ${error.message}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (approveId) {
    await approvePremiumRequest(approveId);
    return;
  }

  if (updatePackageId) {
    await updatePremiumRequestPackage(updatePackageId);
    return;
  }

  if (rejectId) {
    await rejectPremiumRequest(rejectId);
  }
}

async function updatePremiumRequestPackage(id) {
  if (!ensureAdmin()) return;
  const request = state.premiumRequests.find((row) => row.id === id);
  if (!request) return;
  const select = els.premiumList.querySelector(`select[data-package-select="${CSS.escape(id)}"]`);
  const packageCode = select?.value;
  if (!["P1", "P2", "P3"].includes(packageCode)) {
    alert("Pilih paket yang valid.");
    return;
  }

  const amount = premiumPackageAmount(packageCode);
  startProgress("Ubah Paket Premium", `Mengubah ${request.username} ke ${packageCode}...`);

  const { error: requestError } = await state.supabaseClient
    .from("monitoring_premium_requests")
    .update({
      package_code: packageCode,
      amount,
      reviewer_note: request.status === "approved"
        ? `Paket dikoreksi admin ke ${packageCode}`
        : `Paket diubah admin ke ${packageCode}`,
    })
    .eq("id", id);

  if (requestError) {
    failProgress(`Gagal update pengajuan: ${requestError.message}`);
    alert(`Gagal update pengajuan: ${requestError.message}`);
    return;
  }

  if (request.status === "approved") {
    const { error: profileError } = await state.supabaseClient
      .from("monitoring_profiles")
      .update({
        premium_package: packageCode,
        premium_updated_at: new Date().toISOString(),
      })
      .eq("user_id", request.user_id);

    if (profileError) {
      failProgress(`Pengajuan berubah, tapi profil gagal update: ${profileError.message}`);
      alert(`Pengajuan berubah, tapi profil gagal update: ${profileError.message}`);
      return;
    }
  }

  finishProgress(`Paket ${request.username} berhasil diubah ke ${packageCode}.`);
  await loadPremiumRequests();
}

async function approvePremiumRequest(id) {
  if (!ensureAdmin()) return;
  const request = state.premiumRequests.find((row) => row.id === id);
  if (!request) return;

  if (request.request_type === "device_reset") {
    await approveDeviceResetRequest(request);
    return;
  }

  const activeUntil = addDaysDateString(new Date(), 30);
  startProgress("ACC Premium", `Mengaktifkan ${request.username} sampai ${activeUntil}...`);

  const { error: profileError } = await state.supabaseClient
    .from("monitoring_profiles")
    .update({
      premium_package: request.package_code,
      premium_active_until: activeUntil,
      premium_device_id: null,
      premium_device_bound_at: null,
      premium_updated_at: new Date().toISOString(),
    })
    .eq("user_id", request.user_id);

  if (profileError) {
    failProgress(`Gagal update paket: ${profileError.message}`);
    alert(`Gagal update paket: ${profileError.message}`);
    return;
  }

  const { error: requestError } = await state.supabaseClient
    .from("monitoring_premium_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: state.user.id,
      reviewer_note: `Aktif sampai ${activeUntil}`,
    })
    .eq("id", id);

  if (requestError) {
    failProgress(`Paket aktif, tapi gagal update status pengajuan: ${requestError.message}`);
    alert(`Paket aktif, tapi gagal update status pengajuan: ${requestError.message}`);
    return;
  }

  finishProgress(`Premium ${request.username} aktif sampai ${activeUntil}.`);
  await loadPremiumRequests();
}

async function approveDeviceResetRequest(request) {
  if (!request.requested_device_id) {
    alert("Device ID pengajuan kosong.");
    return;
  }

  startProgress("ACC Device", `Mengganti device premium ${request.username}...`);
  const { error: profileError } = await state.supabaseClient
    .from("monitoring_profiles")
    .update({
      premium_device_id: request.requested_device_id,
      premium_device_bound_at: new Date().toISOString(),
      premium_updated_at: new Date().toISOString(),
    })
    .eq("user_id", request.user_id);

  if (profileError) {
    failProgress(`Gagal update device premium: ${profileError.message}`);
    alert(`Gagal update device premium: ${profileError.message}`);
    return;
  }

  const { error: requestError } = await state.supabaseClient
    .from("monitoring_premium_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: state.user.id,
      reviewer_note: "Device premium diganti admin",
    })
    .eq("id", request.id);

  if (requestError) {
    failProgress(`Device berubah, tapi status pengajuan gagal: ${requestError.message}`);
    alert(`Device berubah, tapi status pengajuan gagal: ${requestError.message}`);
    return;
  }

  finishProgress(`Device premium ${request.username} berhasil diverifikasi.`);
  await loadPremiumRequests();
}

async function rejectPremiumRequest(id) {
  if (!ensureAdmin()) return;
  const { error } = await state.supabaseClient
    .from("monitoring_premium_requests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: state.user.id,
      reviewer_note: "Ditolak admin",
    })
    .eq("id", id);

  if (error) {
    alert(`Gagal menolak pengajuan: ${error.message}`);
    return;
  }

  await loadPremiumRequests();
}

function renderPetugasRows(rows) {
  const totalRupiah = rows.reduce((sum, row) => sum + Number(row.rptag || 0), 0);
  els.metricAwal.textContent = formatNumber(rows.length);
  els.metricAkhir.textContent = formatRupiah(totalRupiah);
  els.metricPelunasan.textContent = state.profile?.petugas || "-";
  els.metricPersen.textContent = "Petugas";

  els.tableFoot.innerHTML = rows.length ? `
    <tr>
      <td colspan="2">TOTAL</td>
      <td>${formatNumber(rows.length)}</td>
      <td colspan="5"></td>
      <td colspan="2">${formatRupiah(totalRupiah)}</td>
    </tr>
  ` : "";

  els.tableBody.innerHTML = rows.length
    ? rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="name-cell">${escapeHtml(row.nama || "")}</td>
        <td>${escapeHtml(row.idpel || "")}</td>
        <td>${escapeHtml(row.tarif || "")}</td>
        <td>${escapeHtml(row.daya || "")}</td>
        <td>${escapeHtml(row.lembar || "")}</td>
        <td>${escapeHtml(row.kolok || "")}</td>
        <td>${escapeHtml(row.koked || "")}</td>
        <td>${formatRupiah(row.rptag)}</td>
        <td>${escapeHtml(row.alamat || "")}</td>
      </tr>
    `).join("")
    : `<tr><td class="empty-state" colspan="10">Belum ada tunggakan untuk user ini.</td></tr>`;

  renderPetugasHeader();
}

function renderPetugasHeader() {
  const thead = document.querySelector("#monitoringTable thead");
  thead.innerHTML = `
    <tr>
      <th>NO</th>
      <th>NAMA</th>
      <th>IDPEL</th>
      <th>TARIF</th>
      <th>DAYA</th>
      <th>LEMBAR</th>
      <th>KOLOK</th>
      <th>KOKED</th>
      <th>RPTAG</th>
      <th>ALAMAT</th>
    </tr>
  `;
}

function renderAdminHeader() {
  const thead = document.querySelector("#monitoringTable thead");
  thead.innerHTML = `
    <tr>
      <th rowspan="2">NO</th>
      <th rowspan="2">BILLER</th>
      <th colspan="2">SALDO AWAL</th>
      <th colspan="2">SALDO AKHIR</th>
      <th colspan="2">PELUNASAN TOTAL</th>
      <th colspan="2">PELUNASAN TAGIHAN (%)</th>
    </tr>
    <tr>
      <th>ID PEL</th>
      <th>RP TAGIHAN</th>
      <th>ID PEL</th>
      <th>RP TAGIHAN</th>
      <th>PEL</th>
      <th>TAGIHAN</th>
      <th>PEL</th>
      <th>TAGIHAN</th>
    </tr>
  `;
}

async function saveCloudData(options = {}) {
  if (!ensureOnlineReady()) return false;
  if (!ensureAdmin()) return false;

  const embeddedProgress = options.embeddedProgress === true;
  if (embeddedProgress) {
    updateProgress(68, "Menyimpan data utama ke Supabase...");
  } else {
    startProgress("Simpan ke Online", "Menyimpan data utama ke Supabase...");
  }
  setOnlineStatus("Menyimpan data ke online...");
  const cloudPayload = await encodeCloudPayload({
    dil: state.dil,
    awal: state.awal,
    akhir: state.akhir,
    struk: state.struk,
    uploadMeta: state.uploadMeta,
    saldoAkhirRataRata: state.saldoAkhirRataRata,
    dailyPelunasan: state.dailyPelunasan,
    comparisonMonitoring: state.comparisonMonitoring,
  });

  const { error } = await state.supabaseClient
    .from("monitoring_app_state")
    .upsert({
      id: CLOUD_STATE_ID,
      payload: cloudPayload,
      updated_by: state.user.id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    failProgress(`Gagal simpan online: ${error.message}`);
    setOnlineStatus(`Gagal simpan online: ${error.message}`);
    return false;
  }

  if (!options.skipPublish) {
    try {
      updateProgress(embeddedProgress ? 74 : 35, "Mempublish data pelanggan tersisa...");
      await publishRemainingCustomers();
    } catch (publishError) {
      failProgress(`Gagal publish data petugas: ${publishError.message}`);
      setOnlineStatus(`Data utama tersimpan, tapi gagal publish data petugas: ${publishError.message}`);
      return false;
    }

    updateProgress(embeddedProgress ? 82 : 70, "Mempublish data stand meter struk...");
    await publishReceiptMeters();
  }

  const savedMessage = `Data online tersimpan: ${formatDateTime(new Date().toISOString())}.`;
  if (!embeddedProgress) finishProgress(savedMessage);
  setOnlineStatus(savedMessage);
  return true;
}

async function encodeCloudPayload(payload) {
  const basePayload = {
    schemaVersion: 2,
    savedAt: new Date().toISOString(),
    dil: payload.dil || [],
    awal: payload.awal || [],
    akhir: payload.akhir || [],
    struk: payload.struk || [],
    uploadMeta: normalizeUploadMeta(payload.uploadMeta),
    saldoAkhirRataRata: normalizeSaldoAverageState(payload.saldoAkhirRataRata),
    dailyPelunasan: normalizeDailyPelunasanState(payload.dailyPelunasan),
    comparisonMonitoring: normalizeComparisonMonitoringState(payload.comparisonMonitoring),
  };

  if (!window.CompressionStream) return basePayload;

  try {
    const json = JSON.stringify(basePayload);
    const compressed = await compressText(json);
    return {
      schemaVersion: 2,
      encoding: "gzip-base64",
      savedAt: basePayload.savedAt,
      counts: {
        dil: basePayload.dil.length,
        awal: basePayload.awal.length,
        akhir: basePayload.akhir.length,
        struk: basePayload.struk.length,
      },
      data: compressed,
    };
  } catch (error) {
    console.warn("Gagal kompres payload online, memakai format biasa.", error);
    return basePayload;
  }
}

async function decodeCloudPayload(payload) {
  if (!payload?.encoding || payload.encoding !== "gzip-base64" || !payload.data) {
    return payload || {};
  }

  if (!window.DecompressionStream) {
    throw new Error("Browser ini belum mendukung baca data online terkompres. Gunakan Chrome/Edge terbaru.");
  }

  const json = await decompressText(payload.data);
  return JSON.parse(json);
}

async function compressText(text) {
  const stream = new Blob([text], { type: "application/json" })
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(stream).blob();
  return blobToBase64(blob);
}

async function decompressText(base64) {
  const bytes = base64ToBytes(base64);
  const stream = new Blob([bytes], { type: "application/gzip" })
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBytes(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function publishRemainingCustomers() {
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") return null;

  const uploadedAt = new Date().toISOString();
  const rows = [...state.remainingByPetugas.values()].flat().map((row) => ({
    report_id: CLOUD_STATE_ID,
    petugas: row.petugas,
    idpel: row.idpel,
    nama: row.nama,
    tarif: row.tarif,
    daya: row.daya,
    alamat: row.alamat,
    lembar: row.lembar || 0,
    kolok: row.kolok,
    koked: row.koked,
    rptag: row.rptag || 0,
    uploaded_at: uploadedAt,
  }));

  const { error: deleteError } = await state.supabaseClient
    .from("monitoring_remaining_customers")
    .delete()
    .eq("report_id", CLOUD_STATE_ID);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!rows.length) return { uploadedAt, count: 0 };

  await insertInChunks("monitoring_remaining_customers", rows, 500);

  return { uploadedAt, count: rows.length };
}

async function publishReceiptMeters() {
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") return;

  const rows = state.struk.map((row) => ({
    report_id: CLOUD_STATE_ID,
    idpel: row.idpel,
    stand_awal: row.standAwal,
    stand_akhir: row.standAkhir,
    uploaded_at: new Date().toISOString(),
  }));

  const { error: deleteError } = await state.supabaseClient
    .from("monitoring_receipt_meters")
    .delete()
    .eq("report_id", CLOUD_STATE_ID);

  if (deleteError) {
    setOnlineStatus(`Data utama tersimpan, tapi gagal reset stand meter: ${deleteError.message}`);
    return;
  }

  if (!rows.length) return;

  try {
    await insertInChunks("monitoring_receipt_meters", rows, 500);
  } catch (error) {
    setOnlineStatus(`Data utama tersimpan, tapi gagal upload stand meter: ${error.message}`);
  }
}

async function insertInChunks(tableName, rows, chunkSize = 500) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await state.supabaseClient
      .from(tableName)
      .insert(chunk);

    if (error) throw new Error(error.message);
  }
}

async function autoSaveCloudData(options = {}) {
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") return false;
  return saveCloudData(options);
}

function ensureOnlineReady() {
  if (!state.supabaseClient) {
    alert("Supabase belum dikonfigurasi.");
    return false;
  }

  if (!state.user) {
    alert("Login dulu untuk memakai data online.");
    return false;
  }

  return true;
}

function ensureAdmin() {
  if (state.profile?.role !== "admin") {
    alert("Hanya admin yang bisa upload dan menyimpan data online.");
    return false;
  }
  return true;
}

function updateOnlineUi() {
  const online = Boolean(state.user);
  if (els.authGate) els.authGate.hidden = online;
  if (els.appShell) els.appShell.hidden = !online;
  els.onlineButton.textContent = online ? "Online Aktif" : "Login Online";
  els.loginForm.hidden = online;
  els.syncActions.hidden = !online || state.profile?.role === "petugas";
  if (els.premiumPanel) els.premiumPanel.hidden = !online || state.profile?.role !== "admin";
  applyRoleView();
  updateHeaderActions();
  setOnlineStatus(online
    ? state.profile?.role === "petugas"
      ? `Login sebagai ${state.user.email}. Mode petugas: ${state.profile.petugas || "-"}.`
      : `Login sebagai ${state.user.email}. Mode admin. Data online dimuat saat login dan upload otomatis tersimpan ke Supabase.`
    : state.supabaseClient
      ? "Supabase siap. Silakan login untuk sinkronisasi online."
      : "Supabase belum dikonfigurasi. Isi supabase-config.js untuk mode online.");
  setGateStatus(state.supabaseClient
    ? "Silakan login untuk membuka SIMONTOK Admin."
    : "Supabase belum dikonfigurasi. Isi supabase-config.js untuk mode online.");
}

function setGateStatus(message) {
  if (els.gateLoginStatus) els.gateLoginStatus.textContent = message;
}

function applyRoleView() {
  const petugasMode = state.profile?.role === "petugas";
  const saldoAverageTab = document.querySelector('[data-tab="saldo-rata"]');
  const saldoAveragePanel = document.querySelector('[data-tab-panel="saldo-rata"]');
  const dailyTab = document.querySelector('[data-tab="pelunasan-harian"]');
  const dailyPanel = document.querySelector('[data-tab-panel="pelunasan-harian"]');
  const comparisonPanel = document.querySelector('[data-tab-panel="comparison"]');
  els.adminOnlyMenus.forEach((item) => {
    item.hidden = petugasMode;
  });
  if (saldoAverageTab) saldoAverageTab.hidden = petugasMode;
  if (saldoAveragePanel && petugasMode) saldoAveragePanel.hidden = true;
  if (dailyTab) dailyTab.hidden = petugasMode;
  if (dailyPanel && petugasMode) dailyPanel.hidden = true;
  if (comparisonPanel && petugasMode) comparisonPanel.hidden = true;
  if (petugasMode && ["saldo-rata", "pelunasan-harian", "comparison", "premium"].includes(state.activeTab)) switchTab("laporan");
  els.uploadGrid.hidden = petugasMode;
  els.summaryGrid.hidden = petugasMode;
  els.toolbar.hidden = false;
  els.anomalySection.hidden = petugasMode;
  updateHeaderActions();
}

function updateHeaderActions() {
  const petugasMode = state.profile?.role === "petugas";
  els.onlineButton.hidden = false;
  els.resetButton.hidden = petugasMode || state.activeTab !== "upload";
  els.exportButton.hidden = petugasMode || state.activeTab !== "laporan";
  if (els.exportJpgButton) els.exportJpgButton.hidden = petugasMode || state.activeTab !== "laporan";
}

function setOnlineStatus(message) {
  if (els.onlineStatus) els.onlineStatus.textContent = message;
}

function startProgress(title, text = "Menyiapkan proses.") {
  if (!els.progressPanel) return;
  els.progressPanel.hidden = false;
  updateProgress(0, text, title);
}

function updateProgress(percent, text, title) {
  if (!els.progressPanel) return;
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  if (title) els.progressTitle.textContent = title;
  els.progressPercent.textContent = `${value}%`;
  els.progressFill.style.width = `${value}%`;
  if (text) els.progressText.textContent = text;
}

function finishProgress(text = "Selesai.") {
  updateProgress(100, text);
  window.setTimeout(() => {
    if (els.progressPanel) els.progressPanel.hidden = true;
  }, 1400);
}

function failProgress(text = "Proses gagal.") {
  updateProgress(100, text);
}

function yieldUi() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function handleUpload(event, kind) {
  const file = event.target.files?.[0];
  if (!file) return;

  const label = kind === "dil" ? "DIL" : kind === "awal" ? "Saldo Awal" : "Saldo Akhir";
  startProgress(`Upload ${label}`, `Membaca file ${file.name}...`);
  try {
    const rows = await readWorkbook(file, (percent) => {
      updateProgress(percent * 0.35, `Membaca file ${file.name}...`);
    });
    updateProgress(42, `Memproses ${formatNumber(rows.length)} baris ${label}...`);
    await yieldUi();
    state[kind] = kind === "dil" ? normalizeDil(rows) : normalizeSaldo(rows);
    state.uploadMeta[kind] = { uploadedAt: new Date().toISOString(), fileName: file.name };
    updateProgress(58, "Menyimpan data lokal...");
    await saveStoredData();
    updateProgress(66, "Menghitung ulang laporan...");
    recompute();
    updateProgress(72, "Sinkronisasi online otomatis...");
    const onlineSaved = await autoSaveCloudData({ embeddedProgress: true });
    if (kind === "akhir") switchTab("laporan");
    finishProgress(`${label} selesai diproses: ${formatNumber(state[kind].length)} baris.${onlineSaved ? " Data online sudah otomatis tersimpan." : ""}`);
  } catch (error) {
    failProgress(`Gagal membaca file ${file.name}: ${error.message}`);
    alert(`Gagal membaca file ${file.name}: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function handleStrukUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  startProgress("Upload File Struk", `Membaca file ${file.name}...`);
  try {
    const rows = await readWorkbook(file, (percent) => {
      updateProgress(percent * 0.35, `Membaca file ${file.name}...`);
    });
    updateProgress(42, `Memproses ${formatNumber(rows.length)} baris stand meter...`);
    await yieldUi();
    state.struk = normalizeStruk(rows);
    state.uploadMeta.struk = { uploadedAt: new Date().toISOString(), fileName: file.name };
    updateProgress(58, "Menyimpan data lokal...");
    await saveStoredData();
    updateProgress(68, "Memperbarui status file...");
    updateFileStatuses();
    updateProgress(74, "Sinkronisasi online otomatis...");
    const onlineSaved = await autoSaveCloudData({ embeddedProgress: true });
    finishProgress(`File struk selesai diproses: ${formatNumber(state.struk.length)} IDPEL stand meter.${onlineSaved ? " Data online sudah otomatis tersimpan." : ""}`);
    setOnlineStatus(`File struk dimuat: ${formatNumber(state.struk.length)} IDPEL stand meter.`);
  } catch (error) {
    failProgress(`Gagal membaca file ${file.name}: ${error.message}`);
    alert(`Gagal membaca file ${file.name}: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function readWorkbook(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, (event.loaded / event.total) * 100));
    };
    reader.onload = () => {
      try {
        onProgress(100);
        const workbook = XLSX.read(reader.result, { type: "array", cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = sheetToObjects(sheet);
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("File tidak bisa dibaca."));
    reader.readAsArrayBuffer(file);
  });
}

function sheetToObjects(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "IDPEL"));
  if (headerIndex === -1) {
    throw new Error("Header IDPEL tidak ditemukan.");
  }

  const headers = matrix[headerIndex].map((header, index) => {
    const normalized = cleanText(header);
    return normalized || `KOLOM_${index + 1}`;
  });

  return matrix.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function normalizeDil(rows) {
  return rows
    .map((row) => ({
      idpel: normalizeId(getValue(row, ["IDPEL", "ID PEL", "ID_PEL", "ID PELANGGAN"])),
      nama: cleanText(getValue(row, ["NAMA", "NAMA PELANGGAN"])),
      rbm: cleanText(getValue(row, ["RBM"])),
      kolok: cleanText(getValue(row, ["KOLOK", "KOL OK", "KODE LOKASI"], ["KOLOK"])),
      koked: cleanText(getValue(row, ["KOKED", "KO KED", "KODE KEDUDUKAN"], ["KOKED"])),
      petugas: cleanText(getValue(row, ["PETUGAS", "BILLER", "NAMA PETUGAS"], ["PETUGAS", "BILLER"])).toUpperCase(),
    }))
    .filter((row) => row.idpel);
}

function normalizeSaldo(rows) {
  return rows
    .map((row) => {
      const rptag = parseCurrency(getValue(row, ["RPTAG", "RP TAG", "RP TAGIHAN", "TAGIHAN"], ["RPTAG"]));
      const rpbk = parseCurrency(getValue(row, ["RPBK", "RP BK", "BIAYA KETERLAMBATAN"], ["RPBK"]));
      return {
        idpel: normalizeId(getValue(row, ["IDPEL", "ID PEL", "ID_PEL", "ID PELANGGAN", "NO IDPEL"])),
        nama: cleanText(getValue(row, ["NAMA", "NAMA PELANGGAN", "NAMA PEL"], ["NAMA"])),
        tarif: cleanText(getValue(row, ["TARIF"], ["TARIF"])),
        daya: cleanText(getValue(row, ["DAYA"], ["DAYA"])),
        alamat: cleanText(getValue(row, ["ALAMAT"], ["ALAMAT"])),
        lembar: parseCurrency(getValue(row, ["LEMBAR", "LBR", "JML LEMBAR"], ["LEMBAR"])),
        kolok: cleanText(getValue(row, ["KOLOK", "KOL OK", "KODE LOKASI"])),
        koked: cleanText(getValue(row, ["KOKED", "KO KED", "KODE KEDUDUKAN"])),
        rptag,
        rpbk,
        rupiah: rptag + rpbk,
      };
    })
    .filter((row) => row.idpel);
}

function normalizeStruk(rows) {
  return rows
    .map((row) => ({
      idpel: normalizeId(getValue(row, ["IDPEL", "ID PEL", "ID_PEL", "ID PELANGGAN"])),
      standAwal: cleanText(getValue(row, ["STANDAWAL", "STAND AWAL", "STAND_AWAL"])),
      standAkhir: cleanText(getValue(row, ["STANDAKHIR", "STAND AKHIR", "STAND_AKHIR"])),
    }))
    .filter((row) => row.idpel);
}

function recompute() {
  const dilMap = buildDilMap(state.dil);
  const awalGrouped = groupSaldoByPetugas(state.awal, dilMap, "saldo awal");
  const akhirGrouped = groupSaldoByPetugas(state.akhir, dilMap, "saldo akhir");
  const petugasNames = new Set([...awalGrouped.keys(), ...akhirGrouped.keys(), ...dilMap.petugasNames]);
  const report = [];

  for (const petugas of petugasNames) {
    const awal = awalGrouped.get(petugas) || emptySide();
    const akhir = akhirGrouped.get(petugas) || emptySide();
    const pelunasanPel = awal.count - akhir.count;
    const pelunasanRupiah = awal.rupiah - akhir.rupiah;
    report.push({
      petugas,
      awalId: awal.count,
      awalRupiah: awal.rupiah,
      akhirId: akhir.count,
      akhirRupiah: akhir.rupiah,
      pelunasanPel,
      pelunasanRupiah,
      persenPel: percentage(pelunasanPel, awal.count),
      persenTagihan: percentage(pelunasanRupiah, awal.rupiah),
    });
  }

  state.report = report.filter((row) => row.awalId || row.akhirId);
  state.totals = computeTotals(state.report);
  state.remainingByPetugas = buildRemainingByPetugas(akhirGrouped);
  state.anomalies = [
    ...dilMap.anomalies,
    ...awalGrouped.anomalies,
    ...akhirGrouped.anomalies,
    ...findGrowthAnomalies(state.report),
  ];

  updateFileStatuses();
  render();
  renderDailyPelunasanTable();
  renderComparisonMonitoring();
}

function buildDilMap(rows) {
  const byId = new Map();
  const petugasNames = new Set();
  const anomalies = [];

  for (const row of rows) {
    const petugas = row.petugas || "PETUGAS KOSONG";
    if (!row.petugas) {
      anomalies.push({
        type: "DIL petugas kosong",
        message: `IDPEL ${row.idpel} tidak memiliki nama petugas.`,
      });
    }
    if (byId.has(row.idpel)) {
      anomalies.push({
        type: "DIL duplikat",
        message: `IDPEL ${row.idpel} muncul lebih dari satu kali di DIL.`,
      });
    }
    byId.set(row.idpel, { ...row, petugas });
    petugasNames.add(petugas);
  }

  return { byId, petugasNames, anomalies };
}

function groupSaldoByPetugas(rows, dilMap, label) {
  const grouped = new Map();
  const seen = new Set();
  const duplicates = new Set();
  const anomalies = [];

  for (const row of rows) {
    if (seen.has(row.idpel)) duplicates.add(row.idpel);
    seen.add(row.idpel);

    const dil = dilMap.byId.get(row.idpel);
    if (!dil) {
      anomalies.push({
        type: `IDPEL ${label} tidak ada di DIL`,
        message: `IDPEL ${row.idpel} (${row.nama || "tanpa nama"}) tidak dihitung di tabel karena tidak ada di DIL.`,
      });
      continue;
    }

    const petugas = dil.petugas;
    const current = grouped.get(petugas) || emptySide();
    current.ids.add(row.idpel);
    current.rupiah += row.rupiah;
    current.count = current.ids.size;
    const existingDetail = current.rowMap.get(row.idpel);
    if (existingDetail) {
      existingDetail.rptag += row.rupiah;
      existingDetail.lembar += row.lembar;
    } else {
      current.rowMap.set(row.idpel, {
        idpel: row.idpel,
        nama: row.nama || dil.nama,
        tarif: row.tarif,
        daya: row.daya,
        alamat: row.alamat,
        lembar: row.lembar,
        kolok: dil.kolok,
        koked: dil.koked,
        rptag: row.rupiah,
        petugas,
      });
    }
    grouped.set(petugas, current);
  }

  for (const idpel of duplicates) {
    anomalies.push({
      type: `IDPEL duplikat di ${label}`,
      message: `IDPEL ${idpel} muncul lebih dari satu kali. Nilainya dijumlahkan, jumlah pelanggan tetap dihitung satu.`,
    });
  }

  grouped.anomalies = anomalies;
  return grouped;
}

function buildRemainingByPetugas(akhirGrouped) {
  const details = new Map();
  for (const [petugas, value] of akhirGrouped.entries()) {
    details.set(petugas, sortRemainingRows([...value.rowMap.values()]));
  }
  return details;
}

function findGrowthAnomalies(report) {
  return report
    .filter((row) => row.akhirRupiah > row.awalRupiah || row.akhirId > row.awalId)
    .map((row) => ({
      type: "Saldo akhir naik",
      message: `${row.petugas}: saldo akhir lebih besar dari saldo awal pada IDPEL atau rupiah.`,
    }));
}

function computeTotals(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.awalId += row.awalId;
    acc.awalRupiah += row.awalRupiah;
    acc.akhirId += row.akhirId;
    acc.akhirRupiah += row.akhirRupiah;
    acc.pelunasanPel += row.pelunasanPel;
    acc.pelunasanRupiah += row.pelunasanRupiah;
    return acc;
  }, emptyTotals());

  totals.persenPel = percentage(totals.pelunasanPel, totals.awalId);
  totals.persenTagihan = percentage(totals.pelunasanRupiah, totals.awalRupiah);
  return totals;
}

function render() {
  if (state.profile?.role === "petugas") return;
  renderAdminHeader();
  const rows = getVisibleRows();
  const lowPerformerNames = getLowPerformerNames(state.report);

  els.tableBody.innerHTML = rows.length
    ? rows.map((row, index) => renderRow(row, index + 1, lowPerformerNames)).join("")
    : `<tr><td class="empty-state" colspan="10">Belum ada data yang cocok.</td></tr>`;

  els.tableFoot.innerHTML = state.report.length ? renderTotals(state.totals) : "";
  els.exportButton.disabled = state.report.length === 0;
  if (els.exportJpgButton) els.exportJpgButton.disabled = state.report.length === 0;
  els.metricAwal.textContent = formatRupiah(state.totals.awalRupiah);
  els.metricAkhir.textContent = formatRupiah(state.totals.akhirRupiah);
  els.metricPelunasan.textContent = formatRupiah(state.totals.pelunasanRupiah);
  els.metricPersen.textContent = formatPercent(state.totals.persenTagihan);
  renderAnomalies();
}

function getLowPerformerNames(rows) {
  return new Set(
    [...rows]
      .filter((row) => row.awalRupiah > 0)
      .sort((a, b) => a.persenTagihan - b.persenTagihan)
      .slice(0, 5)
      .map((row) => row.petugas)
  );
}

function getVisibleRows() {
  const query = els.searchInput.value.trim().toUpperCase();
  const sort = els.sortSelect.value;

  return [...state.report]
    .filter((row) => !query || row.petugas.includes(query))
    .sort((a, b) => {
      if (sort === "persenAsc") return a.persenTagihan - b.persenTagihan;
      if (sort === "persenDesc") return b.persenTagihan - a.persenTagihan;
      if (sort === "tagihanDesc") return b.akhirRupiah - a.akhirRupiah;
      if (sort === "awalDesc") return b.awalRupiah - a.awalRupiah;
      if (sort === "nameAsc") return a.petugas.localeCompare(b.petugas);
      return b.akhirRupiah - a.akhirRupiah;
    });
}

function renderRow(row, number, lowPerformerNames) {
  const performanceClass = isFullyCleared(row)
    ? "perfect-performer"
    : lowPerformerNames.has(row.petugas)
    ? "low-performer"
    : row.persenTagihan < 85
      ? "medium-performer"
      : "good-performer";

  return `
    <tr class="${performanceClass}">
      <td>${number}</td>
      <td class="name-cell">${escapeHtml(row.petugas)}</td>
      <td>${formatNumber(row.awalId)}</td>
      <td>${formatRupiah(row.awalRupiah)}</td>
      <td>${renderAkhirCountButton(row)}</td>
      <td>${formatRupiah(row.akhirRupiah)}</td>
      <td>${formatNumber(row.pelunasanPel)}</td>
      <td>${formatRupiah(row.pelunasanRupiah)}</td>
      <td class="percent-cell">${renderPercentMeter(row.persenPel)}</td>
      <td class="percent-cell">${renderPercentMeter(row.persenTagihan)}</td>
    </tr>
  `;
}

function isFullyCleared(row) {
  return row.awalId > 0 && row.awalRupiah > 0 && row.akhirId === 0 && row.akhirRupiah === 0;
}

function renderTotals(totals) {
  return `
    <tr>
      <td colspan="2">TOTAL</td>
      <td>${formatNumber(totals.awalId)}</td>
      <td>${formatRupiah(totals.awalRupiah)}</td>
      <td>${renderTotalAkhirButton(totals)}</td>
      <td>${formatRupiah(totals.akhirRupiah)}</td>
      <td>${formatNumber(totals.pelunasanPel)}</td>
      <td>${formatRupiah(totals.pelunasanRupiah)}</td>
      <td class="percent-cell">${renderPercentMeter(totals.persenPel)}</td>
      <td class="percent-cell">${renderPercentMeter(totals.persenTagihan)}</td>
    </tr>
  `;
}

function renderAkhirCountButton(row) {
  if (!row.akhirId) return "0";
  return `
    <button class="count-button" type="button" data-export-petugas="${escapeHtml(row.petugas)}">
      ${formatNumber(row.akhirId)}
    </button>
  `;
}

function renderTotalAkhirButton(totals) {
  if (!totals.akhirId) return "0";
  return `
    <button class="count-button" type="button" data-export-total="true">
      ${formatNumber(totals.akhirId)}
    </button>
  `;
}

function renderPercentMeter(value) {
  const display = formatPercent(value);
  const width = Math.max(0, Math.min(100, Math.round(value || 0)));
  return `
    <div class="percent-meter" style="--value: ${width}%">
      <div class="percent-fill"></div>
      <span>${display}</span>
    </div>
  `;
}

function renderAnomalies() {
  els.anomalyCount.textContent = state.anomalies.length;
  els.anomalyList.innerHTML = state.anomalies.length
    ? state.anomalies.slice(0, 250).map((item) => `
      <div class="anomaly-item">
        <strong>${escapeHtml(item.type)}</strong>
        <span>${escapeHtml(item.message)}</span>
      </div>
    `).join("")
    : `<div class="anomaly-item"><strong>Aman</strong><span>Belum ada anomali terdeteksi.</span></div>`;
}

function handleCountClick(event) {
  const button = event.target.closest(".count-button");
  if (!button) return;

  if (button.dataset.exportTotal) {
    openTotalExportModal();
    return;
  }

  const petugas = button.dataset.exportPetugas;
  if (petugas) openPetugasExportModal(petugas);
}

function openPetugasExportModal(petugas) {
  const rows = getRemainingRows(petugas);
  const missing = countMissingDetailRows(rows);
  state.pendingExport = { type: "single", petugas };
  els.exportModalTitle.textContent = "Export Pelanggan Tersisa";
  els.exportModalSubtitle.textContent = `${petugas} - ${formatNumber(rows.length)} pelanggan tersisa.`;
  els.exportModalBody.innerHTML = `
    <div class="anomaly-item">
      <strong>${escapeHtml(petugas)}</strong>
      <span>File Excel akan berisi NO, IDPEL, NAMA, TARIF, DAYA, ALAMAT, LEMBAR, KOLOK, KOKED, dan RPTAG.</span>
    </div>
    ${missing ? `
      <div class="anomaly-item warning-item">
        <strong>Detail belum lengkap</strong>
        <span>${formatNumber(missing)} baris masih kosong pada TARIF/DAYA/ALAMAT/LEMBAR/KOLOK/KOKED. Upload ulang DIL dan saldo akhir setelah revisi ini.</span>
      </div>
    ` : ""}
  `;
  els.exportModal.hidden = false;
}

function openTotalExportModal() {
  const choices = [...state.remainingByPetugas.entries()]
    .filter(([, rows]) => rows.length)
    .sort(([a], [b]) => a.localeCompare(b));

  state.pendingExport = { type: "multiple" };
  els.exportModalTitle.textContent = "Export Per Petugas";
  els.exportModalSubtitle.textContent = "Pilih ALL untuk satu file semua petugas, atau pilih petugas untuk file terpisah.";
  els.exportModalBody.innerHTML = choices.length
    ? `
      <div class="choice-list">
        <div class="choice-row all-choice">
          <label>
            <input type="checkbox" name="exportAllPetugas" value="ALL" />
            ALL - Semua petugas dalam 1 file
          </label>
          <span>${formatNumber(choices.reduce((sum, [, rows]) => sum + rows.length, 0))} pelanggan</span>
        </div>
        ${choices.map(([petugas, rows]) => `
          <div class="choice-row">
            <label>
              <input type="checkbox" name="petugasExport" value="${escapeHtml(petugas)}" checked />
              ${escapeHtml(petugas)}
            </label>
            <span>${formatNumber(rows.length)} pelanggan</span>
          </div>
        `).join("")}
      </div>
    `
    : `<div class="anomaly-item"><strong>Tidak ada data</strong><span>Saldo akhir pelanggan tersisa masih kosong.</span></div>`;
  els.exportModal.hidden = false;
}

function closeExportModal() {
  els.exportModal.hidden = true;
  state.pendingExport = null;
}

function confirmPendingExport() {
  if (!state.pendingExport) return;

  if (state.pendingExport.type === "single") {
    exportRemainingForPetugas(state.pendingExport.petugas);
    closeExportModal();
    return;
  }

  const exportAll = els.exportModalBody.querySelector('input[name="exportAllPetugas"]')?.checked;
  if (exportAll) {
    exportRemainingAllPetugas();
    closeExportModal();
    return;
  }

  const selected = [...els.exportModalBody.querySelectorAll('input[name="petugasExport"]:checked')]
    .map((input) => input.value);

  if (!selected.length) {
    alert("Pilih minimal satu petugas untuk diexport.");
    return;
  }

  for (const petugas of selected) {
    exportRemainingForPetugas(petugas);
  }
  closeExportModal();
}

function getRemainingRows(petugas) {
  return state.remainingByPetugas.get(petugas) || [];
}

function countMissingDetailRows(rows) {
  return rows.filter((row) => !row.tarif || !row.daya || !row.alamat || !row.lembar || !row.kolok || !row.koked).length;
}

function exportRemainingForPetugas(petugas) {
  const rows = getRemainingRows(petugas);
  const tableRows = [
    [`PELANGGAN TERSISA - ${petugas}`],
    [new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date()).toUpperCase()],
    [],
    ["NO", "IDPEL", "NAMA", "TARIF", "DAYA", "ALAMAT", "LEMBAR", "KOLOK", "KOKED", "RPTAG"],
    ...rows.map((row, index) => [
      index + 1,
      row.idpel,
      row.nama,
      row.tarif,
      row.daya,
      row.alamat,
      row.lembar,
      row.kolok,
      row.koked,
      row.rptag,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 40 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
  ];

  for (let row = 5; row <= tableRows.length; row += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: 9 })];
    if (cell) cell.z = '"Rp"#,##0';
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pelanggan Tersisa");
  XLSX.writeFile(workbook, `pelanggan-tersisa-${slugify(petugas)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportRemainingAllPetugas() {
  const entries = [...state.remainingByPetugas.entries()]
    .filter(([, rows]) => rows.length)
    .sort(([a], [b]) => a.localeCompare(b));

  const rows = entries.flatMap(([petugas, petugasRows]) =>
    petugasRows.map((row) => ({ ...row, petugas }))
  );

  const tableRows = [
    ["PELANGGAN TERSISA - SEMUA PETUGAS"],
    [new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date()).toUpperCase()],
    [],
    ["NO", "PETUGAS", "IDPEL", "NAMA", "TARIF", "DAYA", "ALAMAT", "LEMBAR", "KOLOK", "KOKED", "RPTAG"],
    ...rows.map((row, index) => [
      index + 1,
      row.petugas,
      row.idpel,
      row.nama,
      row.tarif,
      row.daya,
      row.alamat,
      row.lembar,
      row.kolok,
      row.koked,
      row.rptag,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 16 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 40 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
  ];

  for (let row = 5; row <= tableRows.length; row += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: 10 })];
    if (cell) cell.z = '"Rp"#,##0';
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Semua Petugas");
  XLSX.writeFile(workbook, `pelanggan-tersisa-semua-petugas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportReport() {
  startProgress("Export Excel", "Menyiapkan workbook laporan...");
  const rows = getVisibleRows();
  const title = "MONITORING SALDO TUNGGAKAN";
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date()).toUpperCase();

  const tableRows = [
    [title],
    [date],
    [],
    [
      "NO",
      "BILLER",
      "SALDO AWAL",
      "",
      "SALDO AKHIR",
      "",
      "PELUNASAN TOTAL",
      "",
      "PELUNASAN TAGIHAN (%)",
      "",
    ],
    ["", "", "ID PEL", "RP TAGIHAN", "ID PEL", "RP TAGIHAN", "PEL", "TAGIHAN", "PEL", "TAGIHAN"],
    ...rows.map((row, index) => [
      index + 1,
      row.petugas,
      row.awalId,
      row.awalRupiah,
      row.akhirId,
      row.akhirRupiah,
      row.pelunasanPel,
      row.pelunasanRupiah,
      row.persenPel / 100,
      row.persenTagihan / 100,
    ]),
    [
      "",
      "TOTAL",
      state.totals.awalId,
      state.totals.awalRupiah,
      state.totals.akhirId,
      state.totals.akhirRupiah,
      state.totals.pelunasanPel,
      state.totals.pelunasanRupiah,
      state.totals.persenPel / 100,
      state.totals.persenTagihan / 100,
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
    { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
    { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
    { s: { r: 3, c: 6 }, e: { r: 3, c: 7 } },
    { s: { r: 3, c: 8 }, e: { r: 3, c: 9 } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
  ];

  applyExportFormats(worksheet, tableRows.length);
  updateProgress(70, "Menyusun file Excel...");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Monitoring");
  updateProgress(90, "Mengunduh file Excel...");
  XLSX.writeFile(workbook, `monitoring-saldo-tunggakan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  finishProgress("Export Excel selesai.");
}

function exportReportJpg() {
  const rows = getVisibleRows();
  if (!rows.length) {
    alert("Belum ada data laporan untuk didownload.");
    return;
  }

  startProgress("Download JPG", "Menggambar laporan ke gambar...");
  const title = "LAPORAN MONITORING SALDO TUNGGAKAN";
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date()).toUpperCase();
  const lowPerformerNames = getLowPerformerNames(state.report);
  const exportRows = rows.map((row, index) => ({
    no: index + 1,
    biller: row.petugas,
    awalId: formatNumber(row.awalId),
    awalRp: formatRupiah(row.awalRupiah),
    akhirId: formatNumber(row.akhirId),
    akhirRp: formatRupiah(row.akhirRupiah),
    pelunasanPel: formatNumber(row.pelunasanPel),
    pelunasanRp: formatRupiah(row.pelunasanRupiah),
    persenPel: Math.round(row.persenPel),
    persenTagihan: Math.round(row.persenTagihan),
    danger: lowPerformerNames.has(row.petugas),
  }));
  exportRows.push({
    no: "",
    biller: "TOTAL",
    awalId: formatNumber(state.totals.awalId),
    awalRp: formatRupiah(state.totals.awalRupiah),
    akhirId: formatNumber(state.totals.akhirId),
    akhirRp: formatRupiah(state.totals.akhirRupiah),
    pelunasanPel: formatNumber(state.totals.pelunasanPel),
    pelunasanRp: formatRupiah(state.totals.pelunasanRupiah),
    persenPel: Math.round(state.totals.persenPel),
    persenTagihan: Math.round(state.totals.persenTagihan),
    total: true,
  });

  const scale = 2;
  const columns = [
    { key: "no", label: "NO", width: 54, align: "center" },
    { key: "biller", label: "BILLER", width: 260, align: "left" },
    { key: "awalId", group: "SALDO AWAL", label: "ID PEL", width: 100, align: "center" },
    { key: "awalRp", group: "SALDO AWAL", label: "RP TAGIHAN", width: 210, align: "right" },
    { key: "akhirId", group: "SALDO AKHIR", label: "ID PEL", width: 104, align: "center" },
    { key: "akhirRp", group: "SALDO AKHIR", label: "RP TAGIHAN", width: 194, align: "right" },
    { key: "pelunasanPel", group: "PELUNASAN TOTAL", label: "PEL", width: 100, align: "center" },
    { key: "pelunasanRp", group: "PELUNASAN TOTAL", label: "TAGIHAN", width: 210, align: "right" },
    { key: "persenPel", group: "PELUNASAN TAGIHAN (%)", label: "PEL", width: 160, align: "bar" },
    { key: "persenTagihan", group: "PELUNASAN TAGIHAN (%)", label: "TAGIHAN", width: 160, align: "bar" },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const margin = 12;
  const titleHeight = 84;
  const groupHeight = 38;
  const headerHeight = 38;
  const rowHeight = 42;
  const width = tableWidth + margin * 2;
  const height = titleHeight + groupHeight + headerHeight + exportRows.length * rowHeight + margin;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#f8fbfd";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#10202f";
  ctx.font = "700 21px Arial";
  ctx.fillText(title, margin, 36);
  ctx.fillStyle = "#52677a";
  ctx.font = "700 14px Arial";
  ctx.fillText(date, margin, 64);

  const startX = margin;
  let y = titleHeight;
  drawCell(ctx, startX, y, columns[0].width, groupHeight + headerHeight, "NO", { fill: "#e9f1f6", bold: true, align: "center" });
  drawCell(ctx, startX + columns[0].width, y, columns[1].width, groupHeight + headerHeight, "BILLER", { fill: "#e9f1f6", bold: true, align: "center" });

  let x = startX + columns[0].width + columns[1].width;
  [
    ["SALDO AWAL", columns[2].width + columns[3].width],
    ["SALDO AKHIR", columns[4].width + columns[5].width],
    ["PELUNASAN TOTAL", columns[6].width + columns[7].width],
    ["PELUNASAN TAGIHAN (%)", columns[8].width + columns[9].width],
  ].forEach(([label, groupWidth]) => {
    drawCell(ctx, x, y, groupWidth, groupHeight, label, { fill: "#e9f1f6", bold: true, align: "center" });
    x += groupWidth;
  });

  x = startX + columns[0].width + columns[1].width;
  columns.slice(2).forEach((column) => {
    drawCell(ctx, x, y + groupHeight, column.width, headerHeight, column.label, { fill: "#e9f1f6", bold: true, align: "center" });
    x += column.width;
  });

  y += groupHeight + headerHeight;
  exportRows.forEach((row, rowIndex) => {
    x = startX;
    const rowFill = row.total ? "#dcecf7" : rowIndex % 2 === 0 ? "#ffffff" : "#f8fbfd";
    columns.forEach((column) => {
      if (column.align === "bar") {
        drawPercentCell(ctx, x, y, column.width, rowHeight, row[column.key], rowFill, row.total, row.danger);
      } else {
        drawCell(ctx, x, y, column.width, rowHeight, row[column.key], {
          fill: rowFill,
          align: column.align,
          bold: row.total || column.key === "biller",
          danger: row.danger && !row.total,
        });
      }
      x += column.width;
    });
    y += rowHeight;
  });

  updateProgress(86, "Mengunduh file JPG...");
  const link = document.createElement("a");
  link.download = `laporan-monitoring-tunggakan-${new Date().toISOString().slice(0, 10)}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.94);
  link.click();
  finishProgress("Download JPG selesai.");
}

function drawCell(ctx, x, y, width, height, value, options = {}) {
  ctx.fillStyle = options.fill || "#ffffff";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#cfdbe5";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = options.danger ? "#c1121f" : "#10202f";
  ctx.font = `${options.bold ? "700" : "400"} 14px Arial`;
  ctx.textBaseline = "middle";
  const text = String(value ?? "");
  const align = options.align || "left";
  if (align === "right") {
    ctx.textAlign = "right";
    ctx.fillText(text, x + width - 10, y + height / 2);
  } else if (align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(text, x + width / 2, y + height / 2);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, x + 10, y + height / 2);
  }
}

function drawPercentCell(ctx, x, y, width, height, value, fill, total = false, danger = false) {
  drawCell(ctx, x, y, width, height, "", { fill });
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  const barX = x + 8;
  const barY = y + 8;
  const barWidth = width - 16;
  const barHeight = height - 16;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, barX, barY, barWidth, barHeight, 5);
  ctx.fill();
  ctx.strokeStyle = "#ccd6df";
  ctx.stroke();
  ctx.fillStyle = total || percent >= 85 ? "#6fc58a" : danger ? "#f0aaa6" : "#f3ce6b";
  roundRect(ctx, barX, barY, (barWidth * percent) / 100, barHeight, 5);
  ctx.fill();
  ctx.fillStyle = danger && !total ? "#c1121f" : "#10202f";
  ctx.font = "700 14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${percent}%`, x + width / 2, y + height / 2);
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function applyExportFormats(worksheet, rowCount) {
  for (let row = 6; row <= rowCount; row += 1) {
    for (const col of [3, 5, 7]) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: col })];
      if (cell) cell.z = '"Rp"#,##0';
    }

    for (const col of [8, 9]) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: col })];
      if (cell) cell.z = "0%";
    }
  }
}

function applyWorksheetTableBorders(worksheet) {
  if (!worksheet["!ref"]) return;
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const border = {
    top: { style: "thin", color: { rgb: "FFB7C5D2" } },
    bottom: { style: "thin", color: { rgb: "FFB7C5D2" } },
    left: { style: "thin", color: { rgb: "FFB7C5D2" } },
    right: { style: "thin", color: { rgb: "FFB7C5D2" } },
  };

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[ref]) worksheet[ref] = { t: "s", v: "" };
      worksheet[ref].s = {
        ...(worksheet[ref].s || {}),
        border,
        alignment: { vertical: "center", wrapText: true },
      };
      if (row <= 4) {
        worksheet[ref].s.font = { bold: true };
      }
    }
  }
}

async function resetData() {
  const confirmed = confirm("Reset semua data lokal DIL, saldo awal, dan saldo akhir?");
  if (!confirmed) return;
  state.dil = [];
  state.awal = [];
  state.akhir = [];
  state.struk = [];
  state.uploadMeta = {};
  state.dailyPelunasan = emptyDailyPelunasanState();
  state.comparisonMonitoring = emptyComparisonMonitoringState();
  await saveStoredData();
  await autoSaveCloudData();
  syncDailyPelunasanControls();
  syncDailyUndoButton();
  recompute();
}

function emptyComparisonMonitoringState() {
  const selectedMonth = new Date().toISOString().slice(0, 7);
  return {
    saldoPagi: [],
    saldoSore: [],
    sisaBulanLalu: [],
    selectedMonth,
    selectedDailyAwalDate: `${selectedMonth}-01`,
    selectedDailyAkhirDate: `${selectedMonth}-01`,
    selectedLastMonthDate: `${selectedMonth}-01`,
    dailyAwalSnapshots: {},
    dailyAkhirSnapshots: {},
    lastMonthSnapshots: {},
    labels: {},
    uploadMeta: {},
  };
}

function normalizeComparisonMonitoringState(value) {
  const base = emptyComparisonMonitoringState();
  const source = value || {};
  const selectedMonth = normalizeMonthKey(source.selectedMonth || base.selectedMonth);
  return {
    saldoPagi: Array.isArray(source.saldoPagi) ? source.saldoPagi : [],
    saldoSore: Array.isArray(source.saldoSore) ? source.saldoSore : [],
    sisaBulanLalu: Array.isArray(source.sisaBulanLalu) ? source.sisaBulanLalu : [],
    selectedMonth,
    selectedDailyAwalDate: normalizeDailySelectedDate(source.selectedDailyAwalDate, selectedMonth),
    selectedDailyAkhirDate: normalizeDailySelectedDate(source.selectedDailyAkhirDate, selectedMonth),
    selectedLastMonthDate: normalizeDailySelectedDate(source.selectedLastMonthDate, selectedMonth),
    dailyAwalSnapshots: normalizeComparisonSnapshotMap(source.dailyAwalSnapshots),
    dailyAkhirSnapshots: normalizeComparisonSnapshotMap(source.dailyAkhirSnapshots),
    lastMonthSnapshots: normalizeComparisonSnapshotMap(source.lastMonthSnapshots),
    labels: source.labels || {},
    uploadMeta: normalizeUploadMeta(source.uploadMeta),
  };
}

function normalizeComparisonSnapshotMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([date, rows]) => [
    date,
    Array.isArray(rows) ? rows : [],
  ]));
}

function syncComparisonControls() {
  state.comparisonMonitoring.selectedMonth = normalizeMonthKey(state.comparisonMonitoring.selectedMonth);
  if (els.comparisonMonthInput) els.comparisonMonthInput.value = state.comparisonMonitoring.selectedMonth;
  renderComparisonDateOptions();
  setComparisonStatus("dailyAwal", "Saldo awal tanggal");
  setComparisonStatus("dailyAkhir", "Saldo akhir tanggal");
  setComparisonStatus("lastMonth", "Saldo bulan lalu");
}

function setComparisonStatus(kind, label) {
  const statusMap = {
    dailyAwal: els.comparisonDailyAwalStatus,
    dailyAkhir: els.comparisonDailyAkhirStatus,
    lastMonth: els.comparisonLastMonthStatus,
  };
  const status = statusMap[kind];
  if (!status) return;
  const date = comparisonSelectedDate(kind);
  const rows = comparisonSnapshotRows(kind, date);
  const uploadedAt = formatUploadTimestamp(state.comparisonMonitoring.uploadMeta?.[kind]?.[date]?.uploadedAt);
  status.innerHTML = rows.length
    ? `<strong>${escapeHtml(label)} ${formatShortDate(date)}: ${formatNumber(rows.length)} baris tersimpan</strong>${uploadedAt ? `<span>Terakhir upload: ${escapeHtml(uploadedAt)}</span>` : ""}`
    : "Belum ada data";
}

function renderComparisonDateOptions() {
  const month = normalizeMonthKey(state.comparisonMonitoring.selectedMonth);
  const days = getDaysInSelectedMonth(month);
  const controls = [
    ["selectedDailyAwalDate", els.comparisonDailyAwalDateSelect, "dailyAwal"],
    ["selectedDailyAkhirDate", els.comparisonDailyAkhirDateSelect, "dailyAkhir"],
    ["selectedLastMonthDate", els.comparisonLastMonthDateSelect, "lastMonth"],
  ];

  for (const [stateKey, select, snapshotKind] of controls) {
    state.comparisonMonitoring[stateKey] = normalizeDailySelectedDate(state.comparisonMonitoring[stateKey], month);
    if (!select) continue;
    const selectedDate = state.comparisonMonitoring[stateKey];
    select.innerHTML = days.map((date) => {
      const day = Number(date.slice(-2));
      const uploaded = comparisonSnapshotRows(snapshotKind, date).length ? " - sudah upload" : "";
      return `<option value="${date}" ${date === selectedDate ? "selected" : ""}>Tanggal ${day}${uploaded}</option>`;
    }).join("");
  }
}

function handleComparisonMonthChange(event) {
  const month = normalizeMonthKey(event.target.value);
  state.comparisonMonitoring.selectedMonth = month;
  state.comparisonMonitoring.selectedDailyAwalDate = `${month}-01`;
  state.comparisonMonitoring.selectedDailyAkhirDate = `${month}-01`;
  state.comparisonMonitoring.selectedLastMonthDate = `${month}-01`;
  syncComparisonControls();
  renderComparisonMonitoringTable();
  scheduleComparisonMonitoringSave();
}

function handleComparisonDateChange(event, stateKey) {
  state.comparisonMonitoring[stateKey] = event.target.value;
  syncComparisonControls();
  renderComparisonMonitoringTable();
  scheduleComparisonMonitoringSave();
}

function comparisonSelectedDate(kind) {
  if (kind === "dailyAwal") return state.comparisonMonitoring.selectedDailyAwalDate;
  if (kind === "dailyAkhir") return state.comparisonMonitoring.selectedDailyAkhirDate;
  return state.comparisonMonitoring.selectedLastMonthDate;
}

function comparisonSnapshotMap(kind) {
  if (kind === "dailyAwal") return state.comparisonMonitoring.dailyAwalSnapshots;
  if (kind === "dailyAkhir") return state.comparisonMonitoring.dailyAkhirSnapshots;
  return state.comparisonMonitoring.lastMonthSnapshots;
}

function comparisonSnapshotRows(kind, date = comparisonSelectedDate(kind)) {
  return comparisonSnapshotMap(kind)?.[date] || [];
}

async function handleComparisonUpload(event, kind) {
  const file = event.target.files?.[0];
  if (!file) return;
  const labels = {
    dailyAwal: "Saldo Awal Tanggal",
    dailyAkhir: "Saldo Akhir Tanggal",
    lastMonth: "Saldo Bulan Lalu",
  };
  const label = labels[kind] || "Data";
  const date = comparisonSelectedDate(kind);
  startProgress(`Upload ${label}`, `Membaca file ${file.name} untuk tanggal ${formatShortDate(date)}...`);
  try {
    const rows = await readWorkbook(file, (percent) => {
      updateProgress(percent * 0.35, `Membaca file ${file.name}...`);
    });
    updateProgress(45, `Memproses ${formatNumber(rows.length)} baris ${label}...`);
    await yieldUi();
    comparisonSnapshotMap(kind)[date] = normalizeSaldo(rows);
    if (!state.comparisonMonitoring.uploadMeta[kind] || typeof state.comparisonMonitoring.uploadMeta[kind] !== "object") {
      state.comparisonMonitoring.uploadMeta[kind] = {};
    }
    state.comparisonMonitoring.uploadMeta[kind][date] = { uploadedAt: new Date().toISOString(), fileName: file.name };
    syncComparisonControls();
    renderComparisonMonitoringTable();
    updateProgress(72, "Menyimpan data perbandingan...");
    await saveComparisonMonitoringDraft();
    finishProgress(`${label} ${formatShortDate(date)} selesai diproses: ${formatNumber(comparisonSnapshotRows(kind, date).length)} baris.`);
  } catch (error) {
    failProgress(`Gagal membaca file ${file.name}: ${error.message}`);
    alert(`Gagal membaca file ${file.name}: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function renderComparisonMonitoring() {
  syncComparisonControls();
  renderComparisonMonitoringTable();
}

function calculateComparisonMonitoringRows() {
  const dilMap = buildDilMap(state.dil);
  const awalGrouped = groupSaldoByPetugas(state.awal, dilMap, "saldo awal perbandingan");
  const dailyAwalGrouped = groupSaldoByPetugas(comparisonSnapshotRows("dailyAwal"), dilMap, "saldo awal tanggal");
  const dailyAkhirGrouped = groupSaldoByPetugas(comparisonSnapshotRows("dailyAkhir"), dilMap, "saldo akhir tanggal");
  const lastGrouped = groupSaldoByPetugas(comparisonSnapshotRows("lastMonth"), dilMap, "saldo bulan lalu");
  const names = new Set([...awalGrouped.keys(), ...dailyAwalGrouped.keys(), ...dailyAkhirGrouped.keys(), ...lastGrouped.keys()]);

  return [...names].sort((a, b) => a.localeCompare(b, "id-ID")).map((petugas) => {
    const awal = awalGrouped.get(petugas) || emptySide();
    const dailyAwal = dailyAwalGrouped.get(petugas) || emptySide();
    const dailyAkhir = dailyAkhirGrouped.get(petugas) || emptySide();
    const last = lastGrouped.get(petugas) || emptySide();
    const kolok = Object.fromEntries(COMPARISON_KOLOK_KEYS.map((key) => [key, 0]));
    for (const row of dailyAkhir.rowMap.values()) {
      const key = normalizeComparisonKolok(row.kolok);
      if (Object.prototype.hasOwnProperty.call(kolok, key)) kolok[key] += 1;
    }
    const totalPelunasanId = awal.count - dailyAkhir.count;
    const totalPelunasanRupiah = awal.rupiah - dailyAkhir.rupiah;
    const progressId = last.count - dailyAkhir.count;
    const progressRupiah = last.rupiah - dailyAkhir.rupiah;
    return {
      petugas,
      saldoAwalId: awal.count,
      saldoAwalRupiah: awal.rupiah,
      kolok,
      topKolokKeys: getTopComparisonKolokKeys(kolok),
      totalSisaId: dailyAkhir.count,
      totalSisaRupiah: dailyAkhir.rupiah,
      totalPelunasanId,
      totalPelunasanRupiah,
      kumulatifIdPercent: percentage(totalPelunasanId, awal.count),
      kumulatifRupiahPercent: percentage(totalPelunasanRupiah, awal.rupiah),
      dailyAwalId: dailyAwal.count,
      dailyAwalRupiah: dailyAwal.rupiah,
      dailyAkhirId: dailyAkhir.count,
      dailyAkhirRupiah: dailyAkhir.rupiah,
      lunasId: dailyAwal.count - dailyAkhir.count,
      lunasRupiah: dailyAwal.rupiah - dailyAkhir.rupiah,
      lastId: last.count,
      lastRupiah: last.rupiah,
      progressId,
      progressRupiah,
      progressIdPercent: comparisonProgressPercent(last.count, dailyAkhir.count),
      progressRupiahPercent: comparisonProgressPercent(last.rupiah, dailyAkhir.rupiah),
    };
  }).filter((row) => row.saldoAwalId || row.totalSisaId || row.dailyAwalId || row.dailyAkhirId || row.lastId);
}

function normalizeComparisonKolok(value) {
  const text = cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return text ? text.slice(-1) : "";
}

function getTopComparisonKolokKeys(kolok) {
  return new Set(Object.entries(kolok)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([key]) => key));
}

function calculateComparisonMonitoringTotals(rows) {
  const totals = {
    saldoAwalId: 0,
    saldoAwalRupiah: 0,
    totalSisaId: 0,
    totalSisaRupiah: 0,
    totalPelunasanId: 0,
    totalPelunasanRupiah: 0,
    dailyAwalId: 0,
    dailyAwalRupiah: 0,
    dailyAkhirId: 0,
    dailyAkhirRupiah: 0,
    lunasId: 0,
    lunasRupiah: 0,
    lastId: 0,
    lastRupiah: 0,
    progressId: 0,
    progressRupiah: 0,
    kolok: Object.fromEntries(COMPARISON_KOLOK_KEYS.map((key) => [key, 0])),
  };
  rows.forEach((row) => {
    totals.saldoAwalId += row.saldoAwalId;
    totals.saldoAwalRupiah += row.saldoAwalRupiah;
    totals.totalSisaId += row.totalSisaId;
    totals.totalSisaRupiah += row.totalSisaRupiah;
    totals.totalPelunasanId += row.totalPelunasanId;
    totals.totalPelunasanRupiah += row.totalPelunasanRupiah;
    totals.dailyAwalId += row.dailyAwalId;
    totals.dailyAwalRupiah += row.dailyAwalRupiah;
    totals.dailyAkhirId += row.dailyAkhirId;
    totals.dailyAkhirRupiah += row.dailyAkhirRupiah;
    totals.lunasId += row.lunasId;
    totals.lunasRupiah += row.lunasRupiah;
    totals.lastId += row.lastId;
    totals.lastRupiah += row.lastRupiah;
    totals.progressId += row.progressId;
    totals.progressRupiah += row.progressRupiah;
    COMPARISON_KOLOK_KEYS.forEach((key) => {
      totals.kolok[key] += row.kolok[key] || 0;
    });
  });
  totals.topKolokKeys = getTopComparisonKolokKeys(totals.kolok);
  totals.kumulatifIdPercent = percentage(totals.totalPelunasanId, totals.saldoAwalId);
  totals.kumulatifRupiahPercent = percentage(totals.totalPelunasanRupiah, totals.saldoAwalRupiah);
  totals.progressIdPercent = comparisonProgressPercent(totals.lastId, totals.totalSisaId);
  totals.progressRupiahPercent = comparisonProgressPercent(totals.lastRupiah, totals.totalSisaRupiah);
  return totals;
}

function comparisonProgressPercent(lastValue, currentValue) {
  if (!currentValue) return lastValue ? 100 : 0;
  return (lastValue / currentValue) * 100;
}

function renderComparisonMonitoringTable() {
  if (!els.comparisonTableHead || !els.comparisonTableBody || !els.comparisonTableFoot) return;
  const labels = comparisonTableLabels();
  const rows = calculateComparisonMonitoringRows();
  const totals = calculateComparisonMonitoringTotals(rows);
  if (els.comparisonTableDate) {
    const uploadedInfo = [
      comparisonSnapshotRows("dailyAwal").length ? `Saldo awal ${formatShortDate(state.comparisonMonitoring.selectedDailyAwalDate)}` : "",
      comparisonSnapshotRows("dailyAkhir").length ? `Saldo akhir ${formatShortDate(state.comparisonMonitoring.selectedDailyAkhirDate)}` : "",
      comparisonSnapshotRows("lastMonth").length ? `Bulan lalu ${formatShortDate(state.comparisonMonitoring.selectedLastMonthDate)}` : "",
    ].filter(Boolean).join(" | ");
    els.comparisonTableDate.textContent = uploadedInfo || "Pilih tanggal dan upload data perbandingan.";
  }
  els.comparisonTableHead.innerHTML = comparisonTableHeaderTemplate(labels);
  if (!rows.length) {
    els.comparisonTableBody.innerHTML = `<tr><td class="empty-state" colspan="30">Upload DIL, Saldo Awal Database, Saldo Awal Tanggal, Saldo Akhir Tanggal, dan Saldo Bulan Lalu untuk menampilkan perbandingan.</td></tr>`;
    els.comparisonTableFoot.innerHTML = "";
    return;
  }
  els.comparisonTableBody.innerHTML = rows.map((row, index) => comparisonTableRowTemplate(row, index + 1)).join("");
  els.comparisonTableFoot.innerHTML = comparisonTotalRowTemplate(totals);
}

function comparisonTableLabels() {
  const dailyAwalDay = Number(state.comparisonMonitoring.selectedDailyAwalDate?.slice(-2) || 1);
  const dailyAkhirDay = Number(state.comparisonMonitoring.selectedDailyAkhirDate?.slice(-2) || 1);
  const lastMonthDay = Number(state.comparisonMonitoring.selectedLastMonthDate?.slice(-2) || 1);
  return {
    saldoAwal: "SALDO AWAL",
    dailyAwal: `SALDO AWAL TGL ${dailyAwalDay}`,
    dailyAkhir: `SALDO AKHIR TGL ${dailyAkhirDay}`,
    lunas: `LUNAS TGL ${dailyAkhirDay}`,
    lastMonth: `SISA BULAN LALU TGL ${lastMonthDay}`,
  };
}

function comparisonTableHeaderTemplate(labels) {
  return `
    <tr>
      <th rowspan="3">NO</th>
      <th rowspan="3">PETUGAS</th>
      <th colspan="2" rowspan="2">${escapeHtml(labels.saldoAwal)}</th>
      <th colspan="14">PELUNASAN KUMULATIF</th>
      <th colspan="6">PELUNASAN HARIAN</th>
      <th colspan="6">PERBANDINGAN DENGAN BULAN LALU</th>
    </tr>
    <tr>
      <th colspan="8">SISA PER KOLOK</th>
      <th colspan="2">TOTAL SISA</th>
      <th colspan="2">TOTAL PELUNASAN</th>
      <th colspan="2">%</th>
      <th colspan="2">${escapeHtml(labels.dailyAwal)}</th>
      <th colspan="2">${escapeHtml(labels.dailyAkhir)}</th>
      <th colspan="2">${escapeHtml(labels.lunas)}</th>
      <th colspan="2">${escapeHtml(labels.lastMonth)}</th>
      <th colspan="2">PROGRES DG BULAN LALU</th>
      <th colspan="2">%</th>
    </tr>
    <tr>
      <th>ID PEL</th><th>RPTAG</th>
      ${COMPARISON_KOLOK_KEYS.map((key) => `<th>${key}</th>`).join("")}
      <th>ID PEL</th><th>RP TAG</th>
      <th>ID PEL</th><th>RP TAG</th>
      <th>ID PEL</th><th>RP TAG</th>
      <th>ID</th><th>RPTAG</th>
      <th>ID</th><th>RPTAG</th>
      <th>ID</th><th>RPTAG</th>
      <th>ID PEL</th><th>RPTAG</th>
      <th>ID PEL</th><th>RPTAG</th>
      <th>ID PEL</th><th>RPTAG</th>
    </tr>
  `;
}

function comparisonTableRowTemplate(row, index) {
  return `
    <tr>
      <td>${index}</td>
      <td class="name-cell">${escapeHtml(row.petugas)}</td>
      <td>${formatNumber(row.saldoAwalId)}</td>
      <td class="rupiah-cell">${formatRupiah(row.saldoAwalRupiah)}</td>
      ${COMPARISON_KOLOK_KEYS.map((key) => `<td class="${row.topKolokKeys?.has(key) ? "kolok-top-value" : ""}">${formatNumber(row.kolok[key] || 0)}</td>`).join("")}
      <td class="total-sisa-cell">${formatNumber(row.totalSisaId)}</td>
      <td class="rupiah-cell total-sisa-cell">${formatRupiah(row.totalSisaRupiah)}</td>
      <td>${formatSignedNumber(row.totalPelunasanId)}</td>
      <td class="rupiah-cell">${formatSignedRupiah(row.totalPelunasanRupiah)}</td>
      <td class="percent-cell">${renderComparisonScale(row.kumulatifIdPercent)}</td>
      <td class="percent-cell">${renderComparisonScale(row.kumulatifRupiahPercent)}</td>
      <td>${formatNumber(row.dailyAwalId)}</td>
      <td class="rupiah-cell">${formatRupiah(row.dailyAwalRupiah)}</td>
      <td>${formatNumber(row.dailyAkhirId)}</td>
      <td class="rupiah-cell">${formatRupiah(row.dailyAkhirRupiah)}</td>
      <td class="${row.lunasId < 0 ? "negative-value" : ""}">${formatSignedNumber(row.lunasId)}</td>
      <td class="rupiah-cell ${row.lunasRupiah < 0 ? "negative-value" : ""}">${formatSignedRupiah(row.lunasRupiah)}</td>
      <td>${formatNumber(row.lastId)}</td>
      <td class="rupiah-cell last-month-cell">${formatRupiah(row.lastRupiah)}</td>
      <td class="${row.progressId < 0 ? "negative-value" : ""}">${formatSignedNumber(row.progressId)}</td>
      <td class="rupiah-cell ${row.progressRupiah < 0 ? "negative-value" : ""}">${formatSignedRupiah(row.progressRupiah)}</td>
      <td class="${row.progressIdPercent < 0 ? "negative-value" : ""}">${formatSignedPercent(row.progressIdPercent)}</td>
      <td class="${row.progressRupiahPercent < 0 ? "negative-value" : ""}">${formatSignedPercent(row.progressRupiahPercent)}</td>
    </tr>
  `;
}

function comparisonTotalRowTemplate(totals) {
  return `
    <tr class="comparison-total-row">
      <td></td>
      <td>TOTAL</td>
      <td>${formatNumber(totals.saldoAwalId)}</td>
      <td class="rupiah-cell">${formatRupiah(totals.saldoAwalRupiah)}</td>
      ${COMPARISON_KOLOK_KEYS.map((key) => `<td class="${totals.topKolokKeys?.has(key) ? "kolok-top-value" : ""}">${formatNumber(totals.kolok[key] || 0)}</td>`).join("")}
      <td class="total-sisa-cell">${formatNumber(totals.totalSisaId)}</td>
      <td class="rupiah-cell total-sisa-cell">${formatRupiah(totals.totalSisaRupiah)}</td>
      <td>${formatSignedNumber(totals.totalPelunasanId)}</td>
      <td class="rupiah-cell">${formatSignedRupiah(totals.totalPelunasanRupiah)}</td>
      <td>${formatPercent(totals.kumulatifIdPercent)}</td>
      <td>${formatPercent(totals.kumulatifRupiahPercent)}</td>
      <td>${formatNumber(totals.dailyAwalId)}</td>
      <td class="rupiah-cell">${formatRupiah(totals.dailyAwalRupiah)}</td>
      <td>${formatNumber(totals.dailyAkhirId)}</td>
      <td class="rupiah-cell">${formatRupiah(totals.dailyAkhirRupiah)}</td>
      <td class="${totals.lunasId < 0 ? "negative-value" : ""}">${formatSignedNumber(totals.lunasId)}</td>
      <td class="rupiah-cell ${totals.lunasRupiah < 0 ? "negative-value" : ""}">${formatSignedRupiah(totals.lunasRupiah)}</td>
      <td>${formatNumber(totals.lastId)}</td>
      <td class="rupiah-cell last-month-cell">${formatRupiah(totals.lastRupiah)}</td>
      <td class="${totals.progressId < 0 ? "negative-value" : ""}">${formatSignedNumber(totals.progressId)}</td>
      <td class="rupiah-cell ${totals.progressRupiah < 0 ? "negative-value" : ""}">${formatSignedRupiah(totals.progressRupiah)}</td>
      <td class="${totals.progressIdPercent < 0 ? "negative-value" : ""}">${formatSignedPercent(totals.progressIdPercent)}</td>
      <td class="${totals.progressRupiahPercent < 0 ? "negative-value" : ""}">${formatSignedPercent(totals.progressRupiahPercent)}</td>
    </tr>
  `;
}

function renderComparisonScale(value) {
  const percent = Math.round(value || 0);
  const width = Math.max(0, Math.min(100, percent));
  const color = percent >= 85 ? "#63be7b" : percent >= 60 ? "#ffeb84" : "#f8696b";
  return `
    <span class="comparison-scale">
      <span class="comparison-scale-fill" style="width:${width}%; background:${color}"></span>
      <strong>${formatPercent(percent)}</strong>
    </span>
  `;
}

function formatSignedNumber(value) {
  const number = Math.round(value || 0);
  if (number < 0) return `(${formatNumber(Math.abs(number))})`;
  return formatNumber(number);
}

function formatSignedRupiah(value) {
  const number = Math.round(value || 0);
  if (number < 0) return `(Rp ${formatNumber(Math.abs(number))})`;
  return formatRupiah(number);
}

function formatSignedPercent(value) {
  const number = Math.round(value || 0);
  if (number < 0) return `(${Math.abs(number)}%)`;
  return `${number}%`;
}

function getComparisonExportRows() {
  const rows = calculateComparisonMonitoringRows();
  return { rows, totals: calculateComparisonMonitoringTotals(rows), labels: comparisonTableLabels() };
}

function exportComparisonMonitoringExcel() {
  const { rows, totals, labels } = getComparisonExportRows();
  if (!rows.length) {
    alert("Belum ada data Perbandingan Saldo Dengan Bulan Lalu untuk diexport.");
    return;
  }
  startProgress("Download Excel", "Menyiapkan workbook Perbandingan Saldo Dengan Bulan Lalu...");
  const headerTop = ["NO", "PETUGAS", labels.saldoAwal, "", "PELUNASAN KUMULATIF", ...Array(13).fill(""), "PELUNASAN HARIAN", ...Array(5).fill(""), "PERBANDINGAN DENGAN BULAN LALU", ...Array(5).fill("")];
  const headerGroup = ["", "", "", "", "SISA PER KOLOK", ...Array(7).fill(""), "TOTAL SISA", "", "TOTAL PELUNASAN", "", "%", "", labels.dailyAwal, "", labels.dailyAkhir, "", labels.lunas, "", labels.lastMonth, "", "PROGRES DG BULAN LALU", "", "%", ""];
  const headerSub = ["", "", "ID PEL", "RPTAG", ...COMPARISON_KOLOK_KEYS, "ID PEL", "RP TAG", "ID PEL", "RP TAG", "ID PEL", "RP TAG", "ID", "RPTAG", "ID", "RPTAG", "ID", "RPTAG", "ID PEL", "RPTAG", "ID PEL", "RPTAG", "ID PEL", "RPTAG"];
  const dataRows = rows.map((row, index) => comparisonRowToArray(row, index + 1));
  const tableRows = [
    headerTop,
    headerGroup,
    headerSub,
    ...dataRows,
    comparisonRowToArray(totals, "TOTAL", true),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 2, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 17 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: 11 } },
    { s: { r: 1, c: 12 }, e: { r: 1, c: 13 } },
    { s: { r: 1, c: 14 }, e: { r: 1, c: 15 } },
    { s: { r: 1, c: 16 }, e: { r: 1, c: 17 } },
    { s: { r: 0, c: 18 }, e: { r: 0, c: 23 } },
    { s: { r: 1, c: 18 }, e: { r: 1, c: 19 } },
    { s: { r: 1, c: 20 }, e: { r: 1, c: 21 } },
    { s: { r: 1, c: 22 }, e: { r: 1, c: 23 } },
    { s: { r: 0, c: 24 }, e: { r: 0, c: 29 } },
    { s: { r: 1, c: 24 }, e: { r: 1, c: 25 } },
    { s: { r: 1, c: 26 }, e: { r: 1, c: 27 } },
    { s: { r: 1, c: 28 }, e: { r: 1, c: 29 } },
  ];
  worksheet["!cols"] = [
    { wch: 5 }, { wch: 23 }, { wch: 9 }, { wch: 18 },
    ...COMPARISON_KOLOK_KEYS.map(() => ({ wch: 7 })),
    { wch: 9 }, { wch: 18 }, { wch: 11 }, { wch: 18 }, { wch: 9 }, { wch: 12 },
    { wch: 9 }, { wch: 18 }, { wch: 9 }, { wch: 18 }, { wch: 9 }, { wch: 18 },
    { wch: 9 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 9 }, { wch: 12 },
  ];
  styleComparisonWorksheet(worksheet, rows.length);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Perbandingan");
  XLSX.writeFile(workbook, `perbandingan-saldo-dengan-bulan-lalu-${new Date().toISOString().slice(0, 10)}.xlsx`);
  finishProgress("Download Excel Perbandingan Saldo selesai.");
}

function comparisonRowToArray(row, number, total = false) {
  return [
    total ? "" : number,
    total ? "TOTAL" : row.petugas,
    row.saldoAwalId,
    row.saldoAwalRupiah,
    ...COMPARISON_KOLOK_KEYS.map((key) => row.kolok[key] || 0),
    row.totalSisaId,
    row.totalSisaRupiah,
    row.totalPelunasanId,
    row.totalPelunasanRupiah,
    Math.round(row.kumulatifIdPercent || 0) / 100,
    Math.round(row.kumulatifRupiahPercent || 0) / 100,
    row.dailyAwalId,
    row.dailyAwalRupiah,
    row.dailyAkhirId,
    row.dailyAkhirRupiah,
    row.lunasId,
    row.lunasRupiah,
    row.lastId,
    row.lastRupiah,
    row.progressId,
    row.progressRupiah,
    Math.round(row.progressIdPercent || 0) / 100,
    Math.round(row.progressRupiahPercent || 0) / 100,
  ];
}

function styleComparisonWorksheet(worksheet, dataRowCount) {
  applyWorksheetTableBorders(worksheet);
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const totalRowIndex = 3 + dataRowCount;
  const rupiahCols = [3, 13, 15, 19, 21, 23, 25, 27];
  const percentCols = [16, 17, 28, 29];
  const headerFill = "FFFFFF00";
  const totalSisaFill = "FFDAAB99";
  const lastMonthFill = "FFFAA41C";
  const totalFill = "FFD9D9D9";

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[ref]) worksheet[ref] = { t: "s", v: "" };
      worksheet[ref].s = {
        ...(worksheet[ref].s || {}),
        font: { name: "Consolas", sz: 11, bold: row < 3 || row === totalRowIndex },
        alignment: { horizontal: col === 1 ? "left" : "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "FF000000" } },
          bottom: { style: "thin", color: { rgb: "FF000000" } },
          left: { style: "thin", color: { rgb: "FF000000" } },
          right: { style: "thin", color: { rgb: "FF000000" } },
        },
      };
      if (row < 3) worksheet[ref].s.fill = { fgColor: { rgb: headerFill } };
      if ([12, 13].includes(col)) worksheet[ref].s.fill = { fgColor: { rgb: totalSisaFill } };
      if ([24, 25].includes(col)) worksheet[ref].s.fill = { fgColor: { rgb: lastMonthFill } };
      if (row === totalRowIndex) worksheet[ref].s.fill = { fgColor: { rgb: totalFill } };
      if (rupiahCols.includes(col)) worksheet[ref].z = '"Rp" #,##0;("Rp" #,##0);"-"';
      if (percentCols.includes(col)) worksheet[ref].z = '0%;(0%)';
      if ((col === 26 || col === 27 || col === 28 || col === 29) && Number(worksheet[ref].v) < 0) {
        worksheet[ref].s.font = { ...(worksheet[ref].s.font || {}), color: { rgb: "FFFF0000" } };
      }
    }
  }
}

function exportComparisonMonitoringJpg() {
  const { rows, totals, labels } = getComparisonExportRows();
  if (!rows.length) {
    alert("Belum ada data Perbandingan Saldo Dengan Bulan Lalu untuk didownload.");
    return;
  }
  startProgress("Download JPG", "Menggambar tabel Perbandingan Saldo Dengan Bulan Lalu...");
  const exportRows = [...rows, { ...totals, petugas: "TOTAL", total: true }];
  const columns = comparisonCanvasColumns();
  const scale = 2;
  const margin = 12;
  const rowHeight = 26;
  const groupHeight = 26;
  const headerHeight = 26;
  const subHeaderHeight = 26;
  const titleHeight = 58;
  const width = columns.reduce((sum, column) => sum + column.width, 0) + margin * 2;
  const height = titleHeight + groupHeight + headerHeight + subHeaderHeight + exportRows.length * rowHeight + margin;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.font = "700 18px Consolas, monospace";
  ctx.fillText("PERBANDINGAN SALDO DENGAN BULAN LALU", margin, 28);
  ctx.font = "700 12px Consolas, monospace";
  ctx.fillText(new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toUpperCase(), margin, 48);
  drawComparisonCanvasHeader(ctx, columns, labels, margin, titleHeight, groupHeight, headerHeight, subHeaderHeight);
  let y = titleHeight + groupHeight + headerHeight + subHeaderHeight;
  exportRows.forEach((row, index) => {
    let x = margin;
    const fill = row.total ? "#d9d9d9" : "#ffffff";
    columns.forEach((column) => {
      const value = column.key === "no" ? (row.total ? "" : index + 1) : getComparisonCanvasValue(row, column);
      drawComparisonCell(ctx, x, y, column.width, rowHeight, value, {
        fill,
        align: column.align,
        bold: row.total || column.key === "petugas",
        danger: comparisonCanvasDanger(row, column),
        red: column.key.startsWith("kolok.") && row.topKolokKeys?.has(column.key.split(".")[1]),
      });
      x += column.width;
    });
    y += rowHeight;
  });
  const link = document.createElement("a");
  link.download = `perbandingan-saldo-dengan-bulan-lalu-${new Date().toISOString().slice(0, 10)}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.94);
  link.click();
  finishProgress("Download JPG Perbandingan Saldo selesai.");
}

function comparisonCanvasColumns() {
  return [
    { key: "no", width: 42, align: "center" },
    { key: "petugas", width: 170, align: "left" },
    { key: "saldoAwalId", width: 72, align: "center" },
    { key: "saldoAwalRupiah", width: 135, align: "right", rupiah: true },
    ...COMPARISON_KOLOK_KEYS.map((key) => ({ key: `kolok.${key}`, width: 42, align: "center" })),
    { key: "totalSisaId", width: 72, align: "center" },
    { key: "totalSisaRupiah", width: 135, align: "right", rupiah: true },
    { key: "totalPelunasanId", width: 82, align: "center", signed: true },
    { key: "totalPelunasanRupiah", width: 135, align: "right", rupiah: true, signed: true },
    { key: "kumulatifIdPercent", width: 72, align: "center", percent: true },
    { key: "kumulatifRupiahPercent", width: 82, align: "center", percent: true },
    { key: "dailyAwalId", width: 72, align: "center" },
    { key: "dailyAwalRupiah", width: 135, align: "right", rupiah: true },
    { key: "dailyAkhirId", width: 72, align: "center" },
    { key: "dailyAkhirRupiah", width: 135, align: "right", rupiah: true },
    { key: "lunasId", width: 72, align: "center", signed: true },
    { key: "lunasRupiah", width: 135, align: "right", rupiah: true, signed: true },
    { key: "lastId", width: 72, align: "center" },
    { key: "lastRupiah", width: 135, align: "right", rupiah: true },
    { key: "progressId", width: 72, align: "center", signed: true },
    { key: "progressRupiah", width: 135, align: "right", rupiah: true, signed: true },
    { key: "progressIdPercent", width: 72, align: "center", percent: true, signed: true },
    { key: "progressRupiahPercent", width: 82, align: "center", percent: true, signed: true },
  ];
}

function drawComparisonCanvasHeader(ctx, columns, labels, startX, y, groupHeight, headerHeight, subHeaderHeight) {
  const xAt = (index) => startX + columns.slice(0, index).reduce((sum, column) => sum + column.width, 0);
  const widthAt = (start, end) => columns.slice(start, end + 1).reduce((sum, column) => sum + column.width, 0);
  const fullHeaderHeight = groupHeight + headerHeight + subHeaderHeight;
  const yellow = "#ffff00";
  const totalSisa = "#daab99";
  const lastMonth = "#faa41c";

  drawComparisonCell(ctx, xAt(0), y, columns[0].width, fullHeaderHeight, "NO", { fill: yellow, bold: true, align: "center" });
  drawComparisonCell(ctx, xAt(1), y, columns[1].width, fullHeaderHeight, "PETUGAS", { fill: yellow, bold: true, align: "center" });
  drawComparisonCell(ctx, xAt(2), y, widthAt(2, 3), groupHeight + headerHeight, labels.saldoAwal, { fill: yellow, bold: true, align: "center" });

  drawComparisonCell(ctx, xAt(4), y, widthAt(4, 17), groupHeight, "PELUNASAN KUMULATIF", { fill: yellow, bold: true, align: "center" });
  drawComparisonCell(ctx, xAt(18), y, widthAt(18, 23), groupHeight, "PELUNASAN HARIAN", { fill: yellow, bold: true, align: "center" });
  drawComparisonCell(ctx, xAt(24), y, widthAt(24, 29), groupHeight, "PERBANDINGAN DENGAN BULAN LALU", { fill: yellow, bold: true, align: "center" });

  [
    ["SISA PER KOLOK", 4, 11, yellow],
    ["TOTAL SISA", 12, 13, totalSisa],
    ["TOTAL PELUNASAN", 14, 15, yellow],
    ["%", 16, 17, yellow],
    [labels.dailyAwal, 18, 19, yellow],
    [labels.dailyAkhir, 20, 21, yellow],
    [labels.lunas, 22, 23, yellow],
    [labels.lastMonth, 24, 25, lastMonth],
    ["PROGRES DG BULAN LALU", 26, 27, yellow],
    ["%", 28, 29, yellow],
  ].forEach(([label, start, end, fill]) => {
    drawComparisonCell(ctx, xAt(start), y + groupHeight, widthAt(start, end), headerHeight, label, { fill, bold: true, align: "center" });
  });

  const subLabels = [
    "ID PEL", "RPTAG",
    ...COMPARISON_KOLOK_KEYS,
    "ID PEL", "RP TAG",
    "ID PEL", "RP TAG",
    "ID PEL", "RP TAG",
    "ID", "RPTAG",
    "ID", "RPTAG",
    "ID", "RPTAG",
    "ID PEL", "RPTAG",
    "ID PEL", "RPTAG",
    "ID PEL", "RPTAG",
  ];
  subLabels.forEach((label, index) => {
    const columnIndex = index + 2;
    let fill = yellow;
    if (columnIndex === 12 || columnIndex === 13) fill = totalSisa;
    if (columnIndex === 24 || columnIndex === 25) fill = lastMonth;
    drawComparisonCell(ctx, xAt(columnIndex), y + groupHeight + headerHeight, columns[columnIndex].width, subHeaderHeight, label, { fill, bold: true, align: "center" });
  });
}

function getComparisonCanvasValue(row, column) {
  if (column.key.startsWith("kolok.")) return formatNumber(row.kolok[column.key.split(".")[1]] || 0);
  const value = row[column.key];
  if (column.percent) return column.signed ? formatSignedPercent(value) : formatPercent(value);
  if (column.rupiah) return column.signed ? formatSignedRupiah(value) : formatRupiah(value || 0);
  if (column.signed) return formatSignedNumber(value);
  return typeof value === "string" ? value : formatNumber(value || 0);
}

function comparisonCanvasDanger(row, column) {
  return Boolean(column.signed && Number(row[column.key]) < 0);
}

function drawComparisonCell(ctx, x, y, width, height, value, options = {}) {
  ctx.fillStyle = options.fill || "#ffffff";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = options.danger || options.red ? "#ff0000" : "#000000";
  ctx.font = `${options.bold ? "700" : "400"} 12px Consolas, monospace`;
  ctx.textBaseline = "middle";
  const text = String(value ?? "");
  const align = options.align || "left";
  if (align === "right") {
    ctx.textAlign = "right";
    ctx.fillText(text, x + width - 5, y + height / 2);
  } else if (align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(text, x + width / 2, y + height / 2);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, x + 5, y + height / 2);
  }
}

function scheduleComparisonMonitoringSave() {
  window.clearTimeout(state.comparisonMonitoringSaveTimer);
  state.comparisonMonitoringSaveTimer = window.setTimeout(saveComparisonMonitoringDraft, 900);
}

async function saveComparisonMonitoringDraft() {
  await saveStoredData();
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") return;
  const cloudPayload = await encodeCloudPayload({
    dil: state.dil,
    awal: state.awal,
    akhir: state.akhir,
    struk: state.struk,
    uploadMeta: state.uploadMeta,
    saldoAkhirRataRata: state.saldoAkhirRataRata,
    dailyPelunasan: state.dailyPelunasan,
    comparisonMonitoring: state.comparisonMonitoring,
  });
  const { error } = await state.supabaseClient
    .from("monitoring_app_state")
    .upsert({
      id: CLOUD_STATE_ID,
      payload: cloudPayload,
      updated_by: state.user.id,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    setOnlineStatus(`Gagal simpan Perbandingan Saldo Dengan Bulan Lalu: ${error.message}`);
    return;
  }
  setOnlineStatus(`Perbandingan Saldo Dengan Bulan Lalu tersimpan online: ${formatDateTime(new Date().toISOString())}.`);
}

function initializeDailyPelunasanControls() {
  if (!state.dailyPelunasan?.selectedMonth) {
    state.dailyPelunasan = normalizeDailyPelunasanState(state.dailyPelunasan);
  }
  syncDailyPelunasanControls();
}

function syncDailyPelunasanControls() {
  if (els.dailyMonthInput) els.dailyMonthInput.value = state.dailyPelunasan.selectedMonth;
  renderDailyDateOptions();
}

function renderDailyDateOptions() {
  if (!els.dailyDateSelect) return;
  const month = normalizeMonthKey(state.dailyPelunasan.selectedMonth);
  const days = getDaysInSelectedMonth(month);
  const selectedDate = normalizeDailySelectedDate(state.dailyPelunasan.selectedDate, month);
  state.dailyPelunasan.selectedMonth = month;
  state.dailyPelunasan.selectedDate = selectedDate;
  els.dailyDateSelect.innerHTML = days.map((date) => {
    const day = Number(date.slice(-2));
    const uploaded = state.dailyPelunasan.snapshots?.[date] ? " - sudah upload" : "";
    return `<option value="${date}" ${date === selectedDate ? "selected" : ""}>Tanggal ${day}${uploaded}</option>`;
  }).join("");
}

function handleDailyMonthChange(event) {
  state.dailyPelunasan.selectedMonth = normalizeMonthKey(event.target.value);
  state.dailyPelunasan.selectedDate = `${state.dailyPelunasan.selectedMonth}-01`;
  renderDailyDateOptions();
  syncDailyUndoButton();
  renderDailyPelunasanTable();
  scheduleDailyPelunasanSave();
}

function handleDailyDateChange(event) {
  state.dailyPelunasan.selectedDate = event.target.value;
  syncDailyUndoButton();
  scheduleDailyPelunasanSave();
}

async function handleDailySaldoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const date = state.dailyPelunasan.selectedDate;
  startProgress("Upload Saldo Harian", `Membaca file ${file.name} untuk tanggal ${formatShortDate(date)}...`);
  try {
    const rows = await readWorkbook(file, (percent) => {
      updateProgress(percent * 0.35, `Membaca file ${file.name}...`);
    });
    updateProgress(44, "Memproses saldo akhir harian...");
    await yieldUi();
    const normalizedRows = normalizeSaldo(rows);
    const snapshot = buildDailyPelunasanSnapshot(normalizedRows);
    state.dailyPelunasan.snapshots[date] = snapshot;
    updateProgress(68, "Menyimpan snapshot harian...");
    await saveStoredData();
    renderDailyDateOptions();
    renderDailyPelunasanTable();
    syncDailyUndoButton();
    updateProgress(78, "Sinkronisasi online otomatis...");
    await saveDailyPelunasanDraft();
    finishProgress(`Saldo akhir harian ${formatShortDate(date)} tersimpan: ${formatNumber(snapshot.total.akhirId)} IDPEL.`);
  } catch (error) {
    failProgress(`Gagal upload saldo harian: ${error.message}`);
    alert(`Gagal upload saldo harian: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function undoDailyPelunasanUpload() {
  const date = state.dailyPelunasan.selectedDate;
  if (!date || !state.dailyPelunasan.snapshots?.[date]) return;

  const label = formatShortDate(date);
  const confirmed = confirm(`Hapus upload saldo harian untuk tanggal ${label}?`);
  if (!confirmed) return;

  startProgress("Undo Upload Harian", `Menghapus data tanggal ${label}...`);
  delete state.dailyPelunasan.snapshots[date];
  updateProgress(50, "Menyimpan hasil undo...");
  await saveStoredData();
  renderDailyDateOptions();
  renderDailyPelunasanTable();
  syncDailyUndoButton();
  updateProgress(75, "Sinkronisasi online otomatis...");
  await saveDailyPelunasanDraft();
  finishProgress(`Upload tanggal ${label} berhasil dihapus.`);
}

function syncDailyUndoButton() {
  if (!els.undoDailyUploadButton) return;
  const date = state.dailyPelunasan.selectedDate;
  const hasSnapshot = Boolean(date && state.dailyPelunasan.snapshots?.[date]);
  els.undoDailyUploadButton.disabled = !hasSnapshot;
  if (hasSnapshot) {
    els.undoDailyUploadButton.textContent = `Undo ${formatShortDate(date)}`;
  } else {
    els.undoDailyUploadButton.textContent = "Undo Tanggal Dipilih";
  }
}

function buildDailyPelunasanSnapshot(rows) {
  const dilMap = buildDilMap(state.dil);
  const grouped = groupSaldoByPetugas(rows, dilMap, "saldo akhir harian");
  const petugas = {};
  let akhirId = 0;
  let akhirRupiah = 0;

  for (const [name, group] of grouped.entries()) {
    petugas[name] = {
      akhirId: group.count,
      akhirRupiah: group.rupiah,
      customers: Object.fromEntries([...group.rowMap.entries()].map(([idpel, row]) => [idpel, {
        idpel,
        nama: row.nama || "",
        rptag: row.rptag || 0,
      }])),
    };
    akhirId += group.count;
    akhirRupiah += group.rupiah;
  }

  return {
    uploadedAt: new Date().toISOString(),
    petugas,
    total: { akhirId, akhirRupiah },
  };
}

function renderDailyPelunasanTable() {
  if (!els.dailyTableHead || !els.dailyTableBody) return;

  const month = normalizeMonthKey(state.dailyPelunasan.selectedMonth);
  const days = getDaysInSelectedMonth(month);
  const uploadedDates = days.filter((date) => state.dailyPelunasan.snapshots?.[date]);
  if (els.dailyTableDate) {
    const dateLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
    els.dailyTableDate.textContent = `${dateLabel.toUpperCase()} - ${formatNumber(uploadedDates.length)} tanggal sudah upload`;
  }

  els.dailyTableHead.innerHTML = `
    <tr>
      <th rowspan="2">No</th>
      <th rowspan="2">Petugas</th>
      <th colspan="2">Saldo Awal</th>
      ${days.map((date) => `<th class="daily-day ${state.dailyPelunasan.snapshots?.[date] ? "daily-uploaded-day" : ""}" colspan="2">${Number(date.slice(-2))}</th>`).join("")}
    </tr>
    <tr>
      <th>IDPEL</th>
      <th>RPTAG</th>
      ${days.map((date) => `
        <th class="daily-sub ${state.dailyPelunasan.snapshots?.[date] ? "daily-uploaded-day" : ""}">IDPEL</th>
        <th class="daily-sub ${state.dailyPelunasan.snapshots?.[date] ? "daily-uploaded-day" : ""}">RP TAGIHAN</th>
      `).join("")}
    </tr>
  `;

  const rows = calculateDailyPelunasanRows(days);
  if (!rows.length) {
    els.dailyTableBody.innerHTML = `<tr><td class="empty-state" colspan="${4 + (days.length * 2)}">Belum ada data. Upload DIL dan Saldo Awal terlebih dahulu.</td></tr>`;
    setDailyStatus("Upload DIL dan Saldo Awal untuk menampilkan baseline pelunasan harian.");
    return;
  }

  const totals = calculateDailyPelunasanTotals(rows, days);
  els.dailyTableBody.innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td class="name-cell">${escapeHtml(row.petugas)}</td>
      <td>${formatNumber(row.awalId)}</td>
      <td>${formatRupiah(row.awalRupiah)}</td>
      ${days.map((date) => renderDailyPelunasanCell(row.daily[date], date)).join("")}
    </tr>
  `).join("") + `
    <tr class="daily-total-row">
      <td colspan="2">TOTAL</td>
      <td>${formatNumber(totals.awalId)}</td>
      <td>${formatRupiah(totals.awalRupiah)}</td>
      ${days.map((date) => renderDailyPelunasanCell(totals.daily[date], date, { clickable: true })).join("")}
    </tr>
  `;
  setDailyStatus(uploadedDates.length
    ? `Snapshot tersimpan: ${uploadedDates.map((date) => Number(date.slice(-2))).join(", ")}. Upload ulang tanggal yang sama akan menimpa data lama.`
    : "Pilih tanggal lalu upload saldo akhir harian. Upload ulang tanggal yang sama akan menimpa data sebelumnya.");
}

function calculateDailyPelunasanTotals(rows, days) {
  const totals = {
    awalId: 0,
    awalRupiah: 0,
    daily: {},
  };

  for (const row of rows) {
    totals.awalId += row.awalId || 0;
    totals.awalRupiah += row.awalRupiah || 0;
    for (const date of days) {
      if (!row.daily[date]) continue;
      if (!totals.daily[date]) totals.daily[date] = { pelId: 0, pelRupiah: 0 };
      totals.daily[date].pelId += row.daily[date].pelId || 0;
      totals.daily[date].pelRupiah += row.daily[date].pelRupiah || 0;
    }
  }

  return totals;
}

function calculateDailyPelunasanRows(days) {
  const baseline = buildDailyPelunasanBaseline();
  const petugasNames = new Set(baseline.keys());
  for (const date of days) {
    const snapshot = state.dailyPelunasan.snapshots?.[date];
    if (!snapshot) continue;
    Object.keys(snapshot.petugas || {}).forEach((petugas) => petugasNames.add(petugas));
  }

  return [...petugasNames].sort((a, b) => a.localeCompare(b, "id-ID")).map((petugas) => {
    const awal = baseline.get(petugas) || { akhirId: 0, akhirRupiah: 0 };
    let previous = { akhirId: awal.akhirId, akhirRupiah: awal.akhirRupiah, customers: awal.customers || {} };
    const daily = {};

    for (const date of days) {
      const snapshot = state.dailyPelunasan.snapshots?.[date];
      if (!snapshot) continue;
      const current = snapshot.petugas?.[petugas] || { akhirId: 0, akhirRupiah: 0, customers: {} };
      const paidCustomers = snapshotHasCustomerDetails(snapshot)
        ? getDailyPaidCustomers(previous.customers, current.customers)
        : [];
      daily[date] = {
        pelId: previous.akhirId - current.akhirId,
        pelRupiah: previous.akhirRupiah - current.akhirRupiah,
        paidCustomers,
      };
      previous = current;
    }

    return {
      petugas,
      awalId: awal.akhirId,
      awalRupiah: awal.akhirRupiah,
      daily,
    };
  }).filter((row) => row.awalId || row.awalRupiah || Object.keys(row.daily).length);
}

function buildDailyPelunasanBaseline() {
  const dilMap = buildDilMap(state.dil);
  const grouped = groupSaldoByPetugas(state.awal, dilMap, "saldo awal");
  const baseline = new Map();
  for (const [petugas, group] of grouped.entries()) {
    baseline.set(petugas, {
      akhirId: group.count,
      akhirRupiah: group.rupiah,
      customers: Object.fromEntries([...group.rowMap.entries()].map(([idpel, row]) => [idpel, {
        idpel,
        nama: row.nama || "",
        rptag: row.rptag || 0,
      }])),
    });
  }
  return baseline;
}

function getDailyPaidCustomers(previousCustomers = {}, currentCustomers = {}) {
  if (!previousCustomers || !currentCustomers) return [];
  return Object.entries(previousCustomers)
    .filter(([idpel]) => !currentCustomers?.[idpel])
    .map(([idpel, row]) => ({
      idpel,
      nama: row.nama || "",
      rptag: row.rptag || 0,
    }));
}

function snapshotHasCustomerDetails(snapshot) {
  return Object.values(snapshot?.petugas || {}).some((row) => row && row.customers);
}

function renderDailyPelunasanCell(value, date, options = {}) {
  const uploaded = state.dailyPelunasan.snapshots?.[date];
  if (!uploaded) return `<td class="daily-day-cell"></td><td class="daily-day-cell"></td>`;
  const negative = (value?.pelId || 0) < 0 || (value?.pelRupiah || 0) < 0;
  const detailAttrs = options.clickable ? `data-daily-detail-date="${date}" title="Download detail pelanggan lunas ${formatShortDate(date)}"` : "";
  const idContent = options.clickable
    ? `<button class="count-button daily-detail-button" type="button" ${detailAttrs}>${formatNumber(value?.pelId || 0)}</button>`
    : formatNumber(value?.pelId || 0);
  const rupiahContent = options.clickable
    ? `<button class="count-button daily-detail-button" type="button" ${detailAttrs}>${formatRupiah(value?.pelRupiah || 0)}</button>`
    : formatRupiah(value?.pelRupiah || 0);
  return `
    <td class="daily-day-cell ${negative ? "negative-value" : ""}">${idContent}</td>
    <td class="daily-day-cell daily-rupiah ${negative ? "negative-value" : ""}">${rupiahContent}</td>
  `;
}

function handleDailyDetailClick(event) {
  const button = event.target.closest("[data-daily-detail-date]");
  if (!button) return;
  exportDailyPaidCustomerDetail(button.dataset.dailyDetailDate);
}

function getDailyPelunasanExportData() {
  const month = normalizeMonthKey(state.dailyPelunasan.selectedMonth);
  const days = getDaysInSelectedMonth(month);
  const rows = calculateDailyPelunasanRows(days);
  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00`));
  return { month, days, rows, dateLabel };
}

function exportDailyPelunasanExcel() {
  const { month, days, rows, dateLabel } = getDailyPelunasanExportData();
  if (!rows.length) {
    alert("Belum ada data Pelunasan Harian untuk diexport.");
    return;
  }

  startProgress("Export Excel", "Menyiapkan workbook Pelunasan Harian...");
  const totalColumns = 4 + (days.length * 2);
  const title = "MONITORING PELUNASAN HARIAN";
  const totals = calculateDailyPelunasanTotals(rows, days);
  const headerGroup = ["NO", "PETUGAS", "SALDO AWAL", "", ...days.flatMap((date) => [Number(date.slice(-2)), ""])];
  const headerSub = ["", "", "IDPEL", "RP TAGIHAN", ...days.flatMap(() => ["IDPEL", "RP TAGIHAN"])];
  const tableRows = [
    [title],
    [dateLabel.toUpperCase()],
    [],
    headerGroup,
    headerSub,
    ...rows.map((row, index) => [
      index + 1,
      row.petugas,
      row.awalId,
      row.awalRupiah,
      ...days.flatMap((date) => {
        const uploaded = state.dailyPelunasan.snapshots?.[date];
        const daily = row.daily[date];
        return uploaded ? [daily?.pelId || 0, daily?.pelRupiah || 0] : ["", ""];
      }),
    ]),
    [
      "",
      "TOTAL",
      totals.awalId,
      totals.awalRupiah,
      ...days.flatMap((date) => {
        const uploaded = state.dailyPelunasan.snapshots?.[date];
        const daily = totals.daily[date];
        return uploaded ? [daily?.pelId || 0, daily?.pelRupiah || 0] : ["", ""];
      }),
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
    { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } },
    ...days.map((_, index) => {
      const col = 4 + (index * 2);
      return { s: { r: 3, c: col }, e: { r: 3, c: col + 1 } };
    }),
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 10 },
    { wch: 18 },
    ...days.flatMap(() => [{ wch: 9 }, { wch: 18 }]),
  ];

  for (let rowIndex = 6; rowIndex <= tableRows.length; rowIndex += 1) {
    const saldoAwalCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex - 1, c: 3 })];
    if (saldoAwalCell) saldoAwalCell.z = '"Rp"#,##0';
    days.forEach((_, dayIndex) => {
      const rupiahCol = 5 + (dayIndex * 2);
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex - 1, c: rupiahCol })];
      if (cell) cell.z = '"Rp"#,##0';
    });
  }
  applyWorksheetTableBorders(worksheet);

  updateProgress(80, "Mengunduh file Excel...");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pelunasan Harian");
  days.forEach((date) => {
    if (!state.dailyPelunasan.snapshots?.[date]) return;
    const detailRows = buildDailyPaidCustomerDetailRows([date], rows);
    const detailWorksheet = createDailyPaidCustomerDetailWorksheet(date, detailRows, days);
    XLSX.utils.book_append_sheet(workbook, detailWorksheet, dailyDetailSheetName(date));
  });
  XLSX.writeFile(workbook, `pelunasan-harian-${month}.xlsx`);
  finishProgress("Export Excel Pelunasan Harian selesai.");
}

function buildDailyPaidCustomerDetailRows(days, rows) {
  return days.flatMap((date) => rows.flatMap((row) => {
    const paidCustomers = row.daily[date]?.paidCustomers || [];
    return paidCustomers.map((customer) => ({
      date,
      petugas: row.petugas,
      idpel: customer.idpel,
      nama: customer.nama,
      rptag: customer.rptag,
    }));
  }));
}

function exportDailyPaidCustomerDetail(date) {
  const { days, rows } = getDailyPelunasanExportData();
  if (!state.dailyPelunasan.snapshots?.[date]) {
    alert("Tanggal ini belum punya upload saldo akhir.");
    return;
  }

  const detailRows = buildDailyPaidCustomerDetailRows([date], rows);
  if (!detailRows.length) {
    alert("Detail pelanggan lunas belum tersedia untuk tanggal ini. Upload ulang saldo harian tanggal ini dengan versi web terbaru agar detail IDPEL tersimpan.");
    return;
  }

  startProgress("Export Detail IDPEL", `Menyiapkan detail pelanggan lunas ${formatShortDate(date)}...`);
  const worksheet = createDailyPaidCustomerDetailWorksheet(date, detailRows, days);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, dailyDetailSheetName(date));
  XLSX.writeFile(workbook, `detail-pelunasan-${date}.xlsx`);
  finishProgress("Export detail pelanggan lunas selesai.");
}

function createDailyPaidCustomerDetailWorksheet(date, detailRows, days) {
  const previousDate = findPreviousDailySnapshotDate(date, days);
  const tableRows = [
    [`DETAIL PELANGGAN LUNAS ${formatShortDate(date).toUpperCase()}`],
    [`Pembanding: ${previousDate ? formatShortDate(previousDate) : "Saldo Awal"}`],
    [],
    ["NO", "TANGGAL", "PETUGAS", "IDPEL", "NAMA", "RP TAGIHAN"],
    ...detailRows.map((row, index) => [
      index + 1,
      row.date,
      row.petugas,
      row.idpel,
      row.nama,
      row.rptag,
    ]),
    ["", "", "TOTAL", detailRows.length, "", detailRows.reduce((sum, row) => sum + Number(row.rptag || 0), 0)],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 32 },
    { wch: 18 },
  ];
  for (let rowIndex = 5; rowIndex <= tableRows.length; rowIndex += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex - 1, c: 5 })];
    if (cell) cell.z = '"Rp"#,##0';
  }
  applyWorksheetTableBorders(worksheet);
  return worksheet;
}

function dailyDetailSheetName(date) {
  const [year, month, day] = date.split("-");
  return `Pelanggan ${day}-${month}-${year}`;
}

function findPreviousDailySnapshotDate(date, days) {
  const index = days.indexOf(date);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (state.dailyPelunasan.snapshots?.[days[cursor]]) return days[cursor];
  }
  return "";
}

function exportDailyPelunasanJpg() {
  const { month, days, rows, dateLabel } = getDailyPelunasanExportData();
  if (!rows.length) {
    alert("Belum ada data Pelunasan Harian untuk didownload.");
    return;
  }

  startProgress("Download JPG", "Menggambar Pelunasan Harian ke gambar...");
  const totals = calculateDailyPelunasanTotals(rows, days);
  const exportRows = [
    ...rows,
    {
      petugas: "TOTAL",
      awalId: totals.awalId,
      awalRupiah: totals.awalRupiah,
      daily: totals.daily,
      total: true,
    },
  ];
  const scale = 2;
  const columns = [
    { key: "no", label: "NO", width: 54, align: "center" },
    { key: "petugas", label: "PETUGAS", width: 230, align: "left" },
    { key: "awalId", group: "SALDO AWAL", label: "IDPEL", width: 78, align: "center" },
    { key: "awalRupiah", group: "SALDO AWAL", label: "RP TAGIHAN", width: 155, align: "right" },
    ...days.flatMap((date) => [
      { key: `${date}:id`, group: Number(date.slice(-2)), label: "IDPEL", width: 72, align: "center", date },
      { key: `${date}:rp`, group: Number(date.slice(-2)), label: "RP TAGIHAN", width: 145, align: "right", date },
    ]),
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const margin = 12;
  const titleHeight = 84;
  const groupHeight = 36;
  const headerHeight = 36;
  const rowHeight = 38;
  const width = tableWidth + margin * 2;
  const height = titleHeight + groupHeight + headerHeight + exportRows.length * rowHeight + margin;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#f8fbfd";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#10202f";
  ctx.font = "700 21px Arial";
  ctx.fillText("MONITORING PELUNASAN HARIAN", margin, 36);
  ctx.fillStyle = "#52677a";
  ctx.font = "700 14px Arial";
  ctx.fillText(dateLabel.toUpperCase(), margin, 64);

  const startX = margin;
  let y = titleHeight;
  drawCell(ctx, startX, y, columns[0].width, groupHeight + headerHeight, "NO", { fill: "#e9f1f6", bold: true, align: "center" });
  drawCell(ctx, startX + columns[0].width, y, columns[1].width, groupHeight + headerHeight, "PETUGAS", { fill: "#e9f1f6", bold: true, align: "center" });

  let x = startX + columns[0].width + columns[1].width;
  drawCell(ctx, x, y, columns[2].width + columns[3].width, groupHeight, "SALDO AWAL", { fill: "#e9f1f6", bold: true, align: "center" });
  x += columns[2].width + columns[3].width;
  days.forEach((date) => {
    const uploaded = state.dailyPelunasan.snapshots?.[date];
    drawCell(ctx, x, y, columns[4].width + columns[5].width, groupHeight, Number(date.slice(-2)), {
      fill: uploaded ? "#fff7d1" : "#e9f1f6",
      bold: true,
      align: "center",
    });
    x += columns[4].width + columns[5].width;
  });

  x = startX + columns[0].width + columns[1].width;
  columns.slice(2).forEach((column) => {
    const fill = column.date && state.dailyPelunasan.snapshots?.[column.date] ? "#fff7d1" : "#e9f1f6";
    drawCell(ctx, x, y + groupHeight, column.width, headerHeight, column.label, { fill, bold: true, align: "center" });
    x += column.width;
  });

  y += groupHeight + headerHeight;
  exportRows.forEach((row, rowIndex) => {
    const rowFill = row.total ? "#dcecf7" : rowIndex % 2 === 0 ? "#ffffff" : "#f8fbfd";
    x = startX;
    columns.forEach((column) => {
      let value = "";
      let danger = false;
      if (column.key === "no") value = row.total ? "" : rowIndex + 1;
      else if (column.key === "petugas") value = row.petugas;
      else if (column.key === "awalId") value = formatNumber(row.awalId);
      else if (column.key === "awalRupiah") value = formatRupiah(row.awalRupiah);
      else if (column.date && state.dailyPelunasan.snapshots?.[column.date]) {
        const daily = row.daily[column.date] || { pelId: 0, pelRupiah: 0 };
        if (column.key.endsWith(":id")) value = formatNumber(daily.pelId || 0);
        if (column.key.endsWith(":rp")) value = formatRupiah(daily.pelRupiah || 0);
        danger = (daily.pelId || 0) < 0 || (daily.pelRupiah || 0) < 0;
      }
      drawCell(ctx, x, y, column.width, rowHeight, value, {
        fill: rowFill,
        align: column.align,
        danger,
        bold: row.total || column.key === "petugas",
      });
      x += column.width;
    });
    y += rowHeight;
  });

  updateProgress(88, "Mengunduh file JPG...");
  const link = document.createElement("a");
  link.download = `pelunasan-harian-${month}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.94);
  link.click();
  finishProgress("Download JPG Pelunasan Harian selesai.");
}

function getDaysInSelectedMonth(monthKey) {
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`);
}

function normalizeMonthKey(value) {
  const fallback = getCurrentMonthKey();
  return /^\d{4}-\d{2}$/.test(String(value || "")) ? value : fallback;
}

function normalizeDailySelectedDate(value, monthKey) {
  const days = getDaysInSelectedMonth(monthKey);
  return days.includes(value) ? value : days[0];
}

function emptyDailyPelunasanState() {
  const selectedMonth = getCurrentMonthKey();
  return {
    selectedMonth,
    selectedDate: `${selectedMonth}-01`,
    snapshots: {},
  };
}

function normalizeDailyPelunasanState(value) {
  const base = emptyDailyPelunasanState();
  const source = value || {};
  const selectedMonth = normalizeMonthKey(source.selectedMonth || base.selectedMonth);
  return {
    selectedMonth,
    selectedDate: normalizeDailySelectedDate(source.selectedDate, selectedMonth),
    snapshots: source.snapshots && typeof source.snapshots === "object" ? source.snapshots : {},
  };
}

function scheduleDailyPelunasanSave() {
  window.clearTimeout(state.dailyPelunasanSaveTimer);
  state.dailyPelunasanSaveTimer = window.setTimeout(saveDailyPelunasanDraft, 900);
}

async function saveDailyPelunasanDraft() {
  await saveStoredData();
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") return false;

  const cloudPayload = await encodeCloudPayload({
    dil: state.dil,
    awal: state.awal,
    akhir: state.akhir,
    struk: state.struk,
    uploadMeta: state.uploadMeta,
    saldoAkhirRataRata: state.saldoAkhirRataRata,
    dailyPelunasan: state.dailyPelunasan,
    comparisonMonitoring: state.comparisonMonitoring,
  });
  const { error } = await state.supabaseClient
    .from("monitoring_app_state")
    .upsert({
      id: CLOUD_STATE_ID,
      payload: cloudPayload,
      updated_by: state.user.id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    setOnlineStatus(`Gagal simpan Pelunasan Harian: ${error.message}`);
    return false;
  }

  setOnlineStatus(`Pelunasan Harian tersimpan online: ${formatDateTime(new Date().toISOString())}.`);
  return true;
}

function setDailyStatus(message) {
  if (els.dailyStatus) els.dailyStatus.textContent = message;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderSaldoAverageInputs() {
  if (!els.saldoAverageAwalFields || !els.saldoAverageAkhirFields) return;

  els.saldoAverageAwalFields.innerHTML = SALDO_AVERAGE_FIELDS.map((field) => saldoAverageFieldTemplate("awal", field)).join("");
  els.saldoAverageAkhirFields.innerHTML = SALDO_AVERAGE_FIELDS.map((field) => saldoAverageFieldTemplate("akhir", field)).join("");
}

function saldoAverageFieldTemplate(group, field) {
  const id = `saldo-average-${group}-${field.key}`;
  return `
    <div class="saldo-average-field">
      <label for="${id}">${field.label}</label>
      <input id="${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-saldo-average-input="${group}:${field.key}" />
    </div>
  `;
}

function renderSaldoAverage() {
  syncSaldoAverageInputs();
  updateSaldoAverageOutputs();
}

function syncSaldoAverageInputs() {
  document.querySelectorAll("[data-saldo-average-input]").forEach((input) => {
    const [group, key] = input.dataset.saldoAverageInput.split(":");
    const value = state.saldoAkhirRataRata?.[group]?.[key] || 0;
    input.value = value ? formatIntegerInput(value) : "";
  });
  if (els.saldoAverageTarget) {
    const target = state.saldoAkhirRataRata?.target || 0;
    els.saldoAverageTarget.value = target ? formatIntegerInput(target) : "";
  }
}

function handleSaldoAverageInput(event) {
  const target = event.target;
  if (!target) return;

  if (target.dataset.saldoAverageInput) {
    const [group, key] = target.dataset.saldoAverageInput.split(":");
    state.saldoAkhirRataRata[group][key] = parseFlexibleRupiah(target.value);
  } else if (target === els.saldoAverageTarget) {
    state.saldoAkhirRataRata.target = parseFlexibleRupiah(target.value);
  }

  updateSaldoAverageOutputs();
  scheduleSaldoAverageSave();
}

function useEndingSaldoAsBeginning() {
  for (const field of SALDO_AVERAGE_FIELDS) {
    state.saldoAkhirRataRata.awal[field.key] = Number(state.saldoAkhirRataRata.akhir[field.key] || 0);
  }
  renderSaldoAverage();
  scheduleSaldoAverageSave();
  setSaldoAverageCopyStatus("Saldo akhir sudah dijadikan saldo awal.");
}

function updateSaldoAverageOutputs() {
  const report = calculateSaldoAverageReport();
  if (els.saldoAverageAwalTotal) els.saldoAverageAwalTotal.textContent = formatReportRupiah(report.saldoAwal);
  if (els.saldoAverageAkhirTotal) els.saldoAverageAkhirTotal.textContent = formatReportRupiah(report.saldoAkhir);
  if (els.saldoAverageCurrent) els.saldoAverageCurrent.textContent = formatReportRupiah(report.saldoSaatIni);
  if (els.saldoAverageGap) els.saldoAverageGap.textContent = formatReportRupiah(report.gapTarget);
  if (els.saldoAverageReportText) els.saldoAverageReportText.value = renderSaldoAverageReportText(report);
}

function calculateSaldoAverageReport() {
  const data = normalizeSaldoAverageState(state.saldoAkhirRataRata);
  const awal = data.awal;
  const akhir = data.akhir;
  const realisasiKogol4 = awal.kogol4 - akhir.kogol4;
  const realisasi = {
    kogol0Berjalan: awal.kogol0Berjalan - akhir.kogol0Berjalan,
    kogol0Tunggakan: awal.kogol0Tunggakan - akhir.kogol0Tunggakan,
    kogol3Perkantoran: awal.kogol3Perkantoran - akhir.kogol3Perkantoran + realisasiKogol4,
    kogol3Pju: awal.kogol3Pju - akhir.kogol3Pju,
    kogol4: realisasiKogol4,
  };
  const saldoAwal = sumSaldoAverageGroup(awal);
  const saldoAkhir = sumSaldoAverageGroup(akhir);
  const totalRealisasi = realisasi.kogol0Berjalan
    + realisasi.kogol0Tunggakan
    + realisasi.kogol3Perkantoran
    + realisasi.kogol3Pju;
  const saldoSaatIni = saldoAwal - totalRealisasi;

  return {
    saldoAwal,
    saldoAkhir,
    target: data.target,
    realisasi,
    totalRealisasi,
    saldoSaatIni,
    gapTarget: saldoSaatIni - data.target,
  };
}

function renderSaldoAverageReportText(report) {
  return [
    "*LAPORAN HARIAN ULP MUARA SABAK*",
    `*${formatLongIndonesianDate(new Date())}*`,
    "",
    `Saldo Awal : ${formatReportRupiah(report.saldoAwal)}`,
    `Target Saldo Akhir : ${formatReportRupiah(report.target)}`,
    "",
    `Realisasi Lunas Harian Kogol 0 Berjalan : ${formatReportRupiah(report.realisasi.kogol0Berjalan)}`,
    `Realisasi Lunas Harian Kogol 0 Tunggakan : ${formatReportRupiah(report.realisasi.kogol0Tunggakan)}`,
    `Realisasi Lunas Harian Kogol 3 Perkantoran : ${formatReportRupiah(report.realisasi.kogol3Perkantoran)}`,
    `Realisasi Lunas Harian Kogol 3 PJU : ${formatReportRupiah(report.realisasi.kogol3Pju)}`,
    `Total Realisasi Lunas Harian : ${formatReportRupiah(report.totalRealisasi)}`,
    "",
    `Saldo saat ini : ${formatReportRupiah(report.saldoSaatIni)}`,
    "",
    `GAP Terhadap Target : ${formatReportRupiah(report.gapTarget)}`,
  ].join("\n");
}

async function copySaldoAverageReport() {
  const text = els.saldoAverageReportText?.value || "";
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    setSaldoAverageCopyStatus("Laporan berhasil dicopy.");
  } catch (error) {
    els.saldoAverageReportText?.select();
    document.execCommand("copy");
    setSaldoAverageCopyStatus("Laporan dicopy lewat seleksi textbox.");
  }
}

function setSaldoAverageCopyStatus(message) {
  if (!els.saldoAverageCopyStatus) return;
  els.saldoAverageCopyStatus.textContent = message;
  window.setTimeout(() => {
    if (els.saldoAverageCopyStatus) {
      els.saldoAverageCopyStatus.textContent = "Angka boleh diketik pakai koma, titik, atau tanpa pemisah.";
    }
  }, 1800);
}

function scheduleSaldoAverageSave() {
  window.clearTimeout(state.saldoAverageSaveTimer);
  state.saldoAverageSaveTimer = window.setTimeout(saveSaldoAverageDraft, 900);
}

async function saveSaldoAverageDraft() {
  await saveStoredData();
  if (!state.supabaseClient || !state.user || state.profile?.role !== "admin") return;

  const cloudPayload = await encodeCloudPayload({
    dil: state.dil,
    awal: state.awal,
    akhir: state.akhir,
    struk: state.struk,
    uploadMeta: state.uploadMeta,
    saldoAkhirRataRata: state.saldoAkhirRataRata,
    dailyPelunasan: state.dailyPelunasan,
    comparisonMonitoring: state.comparisonMonitoring,
  });
  const { error } = await state.supabaseClient
    .from("monitoring_app_state")
    .upsert({
      id: CLOUD_STATE_ID,
      payload: cloudPayload,
      updated_by: state.user.id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    setOnlineStatus(`Gagal simpan Saldo Akhir Rata Rata: ${error.message}`);
    return;
  }

  setOnlineStatus(`Saldo Akhir Rata Rata tersimpan online: ${formatDateTime(new Date().toISOString())}.`);
}

function emptySaldoAverageState() {
  return {
    awal: emptySaldoAverageGroup(),
    akhir: emptySaldoAverageGroup(),
    target: 0,
  };
}

function emptySaldoAverageGroup() {
  return Object.fromEntries(SALDO_AVERAGE_FIELDS.map((field) => [field.key, 0]));
}

function normalizeSaldoAverageState(value) {
  const normalized = emptySaldoAverageState();
  const source = value || {};
  for (const group of ["awal", "akhir"]) {
    for (const field of SALDO_AVERAGE_FIELDS) {
      normalized[group][field.key] = Number(source[group]?.[field.key] || 0);
    }
  }
  normalized.target = Number(source.target || 0);
  return normalized;
}

function sumSaldoAverageGroup(group) {
  return SALDO_AVERAGE_FIELDS.reduce((total, field) => total + Number(group[field.key] || 0), 0);
}

function getValue(row, candidates, containsCandidates = []) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );

  for (const candidate of candidates) {
    const value = normalized[normalizeHeader(candidate)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }

  for (const candidate of containsCandidates) {
    const candidateHeader = normalizeHeader(candidate);
    const entry = Object.entries(row).find(([key, value]) => {
      const header = normalizeHeader(key);
      return header.includes(candidateHeader) && value !== undefined && value !== null && String(value).trim() !== "";
    });
    if (entry) return entry[1];
  }

  return "";
}

function normalizeHeader(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeId(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function parseCurrency(value) {
  if (typeof value === "number") return value;
  let cleaned = String(value ?? "")
    .replace(/Rp/gi, "")
    .replace(/\s/g, "");

  cleaned = cleaned.replace(/([.,])\d{1,2}$/, "");
  const parsed = Number(cleaned.replace(/[^\d-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFlexibleRupiah(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  const negative = text.startsWith("-");
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function sortRemainingRows(rows) {
  return [...rows].sort((a, b) => {
    const kolok = compareCode(a.kolok, b.kolok);
    if (kolok !== 0) return kolok;
    return compareCode(a.koked, b.koked);
  });
}

function compareCode(a, b) {
  return String(a || "").localeCompare(String(b || ""), "id-ID", {
    numeric: true,
    sensitivity: "base",
  });
}

function slugify(value) {
  return String(value || "petugas")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function percentage(value, base) {
  if (!base) return 0;
  return (value / base) * 100;
}

function emptySide() {
  return { ids: new Set(), count: 0, rupiah: 0, rowMap: new Map() };
}

function emptyTotals() {
  return {
    awalId: 0,
    awalRupiah: 0,
    akhirId: 0,
    akhirRupiah: 0,
    pelunasanPel: 0,
    pelunasanRupiah: 0,
    persenPel: 0,
    persenTagihan: 0,
  };
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatReportRupiah(value) {
  return `Rp ${formatIntegerInput(value)}`;
}

function formatIntegerInput(value) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(value || 0);
}

function formatPercent(value) {
  return `${Math.round(value || 0)}%`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatLongIndonesianDate(value) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

function premiumStatusLabel(status) {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu ACC";
}

function premiumPackageAmount(packageCode) {
  if (packageCode === "P1") return 15000;
  if (packageCode === "P2") return 25000;
  if (packageCode === "P3") return 50000;
  return 0;
}

function addDaysDateString(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateFileStatuses() {
  setStatus("dil", state.dil.length, "DIL");
  setStatus("awal", state.awal.length, "Saldo awal");
  setStatus("akhir", state.akhir.length, "Saldo akhir");
  setStatus("struk", state.struk.length, "Stand meter struk");
}

function setStatus(kind, count, label) {
  const status = els[`${kind}Status`];
  const card = document.querySelector(`[data-file-card="${kind}"]`) || status?.closest(".upload-panel");
  if (!status) return;
  const meta = state.uploadMeta?.[kind] || {};
  const uploadedAt = formatUploadTimestamp(meta.uploadedAt);
  status.innerHTML = count
    ? `
      <strong>${escapeHtml(label)}: ${formatNumber(count)} baris tersimpan</strong>
      ${uploadedAt ? `<span>Terakhir upload: ${escapeHtml(uploadedAt)}</span>` : ""}
    `
    : "Belum ada data";
  card?.classList.toggle("loaded", count > 0);
}

function normalizeUploadMeta(meta = {}) {
  const normalized = {};
  ["dil", "awal", "akhir", "struk", "saldoPagi", "saldoSore", "sisaBulanLalu"].forEach((key) => {
    const item = meta?.[key];
    if (!item?.uploadedAt) return;
    normalized[key] = {
      uploadedAt: item.uploadedAt,
      fileName: item.fileName || "",
    };
  });
  ["dailyAwal", "dailyAkhir", "lastMonth"].forEach((key) => {
    const snapshots = meta?.[key];
    if (!snapshots || typeof snapshots !== "object") return;
    normalized[key] = {};
    Object.entries(snapshots).forEach(([date, item]) => {
      if (!item?.uploadedAt) return;
      normalized[key][date] = {
        uploadedAt: item.uploadedAt,
        fileName: item.fileName || "",
      };
    });
    if (!Object.keys(normalized[key]).length) delete normalized[key];
  });
  return normalized;
}

function formatUploadTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dateText = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(/\./g, ":");
  return `${dateText}, ${timeText}`;
}

function setReportDate() {
  renderOverviewDateTime();
  renderOverviewMotivation();
  window.setInterval(renderOverviewDateTime, 1000);
}

function renderOverviewDateTime() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now).replace(/\./g, ":");
  if (els.reportDate) els.reportDate.textContent = `${date}   ${time}`;
  if (els.tableDate) els.tableDate.textContent = date.toUpperCase();
}

function renderOverviewMotivation() {
  if (!els.overviewQuote) return;
  const now = new Date();
  const dateKey = Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`);
  const index = (dateKey * 7 + now.getDay()) % WORK_MOTIVATION_QUOTES.length;
  els.overviewQuote.textContent = WORK_MOTIVATION_QUOTES[index];
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredData() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get("data");
    request.onsuccess = () => resolve(request.result || {});
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredData() {
  const db = await openDb();
  const payload = {
    dil: state.dil,
    awal: state.awal,
    akhir: state.akhir,
    struk: state.struk,
    uploadMeta: state.uploadMeta,
    saldoAkhirRataRata: state.saldoAkhirRataRata,
    dailyPelunasan: state.dailyPelunasan,
    comparisonMonitoring: state.comparisonMonitoring,
    savedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).put(payload, "data");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
