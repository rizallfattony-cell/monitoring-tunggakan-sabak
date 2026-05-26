const STORE_NAME = "monitoringSaldoTunggakan";
const DB_NAME = "monitoring-saldo-db";
const DB_VERSION = 1;
const CLOUD_STATE_ID = "main";

const state = {
  dil: [],
  awal: [],
  akhir: [],
  struk: [],
  report: [],
  totals: emptyTotals(),
  anomalies: [],
  remainingByPetugas: new Map(),
  pendingExport: null,
  activeTab: "upload",
  supabaseClient: null,
  user: null,
  profile: null,
  premiumRequests: [],
};

const els = {
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
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")],
};

boot();

async function boot() {
  setReportDate();
  attachEvents();
  initSupabase();
  await hydrate();
  await hydrateSession();
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
  els.loginButton.addEventListener("click", loginOnline);
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
  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
}

function switchTab(tabName) {
  if (!tabName) return;
  state.activeTab = tabName;
  els.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabName;
    panel.classList.toggle("is-active", panel.dataset.tabPanel === tabName);
  });
  updateHeaderActions();
}

async function hydrate() {
  const saved = await getStoredData();
  state.dil = saved.dil || [];
  state.awal = saved.awal || [];
  state.akhir = saved.akhir || [];
  state.struk = saved.struk || [];
  updateFileStatuses();
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

async function loginOnline() {
  if (!state.supabaseClient) {
    alert("Supabase belum dikonfigurasi. Isi supabase-config.js terlebih dahulu.");
    return;
  }

  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  if (!email || !password) {
    alert("Isi email dan password.");
    return;
  }

  setOnlineStatus("Login...");
  const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setOnlineStatus(`Login gagal: ${error.message}`);
    return;
  }

  state.user = data.user;
  await loadProfile();
  els.passwordInput.value = "";
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
  state.dil = data.payload.dil || [];
  state.awal = data.payload.awal || [];
  state.akhir = data.payload.akhir || [];
  state.struk = data.payload.struk || [];
  updateProgress(70, "Menyimpan data ke browser...");
  await saveStoredData();
  updateProgress(85, "Menghitung ulang laporan...");
  recompute();
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
  const { error } = await state.supabaseClient
    .from("monitoring_app_state")
    .upsert({
      id: CLOUD_STATE_ID,
      payload: {
        dil: state.dil,
        awal: state.awal,
        akhir: state.akhir,
        struk: state.struk,
      },
      updated_by: state.user.id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    failProgress(`Gagal simpan online: ${error.message}`);
    setOnlineStatus(`Gagal simpan online: ${error.message}`);
    return false;
  }

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

  const savedMessage = `Data online tersimpan: ${formatDateTime(new Date().toISOString())}.`;
  if (!embeddedProgress) finishProgress(savedMessage);
  setOnlineStatus(savedMessage);
  return true;
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

  const { error: insertError } = await state.supabaseClient
    .from("monitoring_remaining_customers")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }

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

  const { error: insertError } = await state.supabaseClient
    .from("monitoring_receipt_meters")
    .insert(rows);

  if (insertError) {
    setOnlineStatus(`Data utama tersimpan, tapi gagal upload stand meter: ${insertError.message}`);
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
}

function applyRoleView() {
  const petugasMode = state.profile?.role === "petugas";
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

async function resetData() {
  const confirmed = confirm("Reset semua data lokal DIL, saldo awal, dan saldo akhir?");
  if (!confirmed) return;
  state.dil = [];
  state.awal = [];
  state.akhir = [];
  state.struk = [];
  await saveStoredData();
  await autoSaveCloudData();
  recompute();
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
  status.textContent = count ? `${label}: ${formatNumber(count)} baris tersimpan` : "Belum ada data";
  card?.classList.toggle("loaded", count > 0);
}

function setReportDate() {
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  els.reportDate.textContent = `Laporan ${date}. DIL dan saldo awal bisa disimpan lokal.`;
  els.tableDate.textContent = date.toUpperCase();
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
    savedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).put(payload, "data");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
