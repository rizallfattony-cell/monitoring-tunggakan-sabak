const PUBLIC_RECEIPT_LIMIT = 20;
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const periodNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const receiptMonthNames = ["JAN", "FEB", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUST", "SEPT", "OKT", "NOV", "DES"];

function parseIdpels(value) {
  const ids = String(value || "").split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
  if (!ids.length || ids.length > PUBLIC_RECEIPT_LIMIT || ids.some((id) => !/^\d{10,16}$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Masukkan 1 sampai 20 IDPEL unik, masing-masing 10-16 digit.");
  }
  return ids;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function money(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Nilai tagihan tidak valid.");
  return rupiah.format(amount);
}

function receiptMoney(value) {
  return money(value).replace(/^Rp\s+/u, "Rp");
}

function parseAdminFee(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000) {
    throw new Error("Biaya admin harus berupa angka Rp0 sampai Rp1.000.000.");
  }
  return amount;
}

function updateReceiptAdminFee(receipt, value) {
  const adminFee = parseAdminFee(value);
  const base = Number(receipt.rptag);
  if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(base + adminFee)) {
    throw new Error("Nilai tagihan tidak valid.");
  }
  return { ...receipt, admin_fee: adminFee, total: base + adminFee };
}

function receiptTime(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Asia/Jakarta",
  }).format(parsed);
}

function receiptHeaderTime(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "Asia/Jakarta",
  }).formatToParts(parsed).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.day} ${String(parts.month || "").toUpperCase()} ${parts.year} - ${parts.hour}:${parts.minute} WIB`;
}

function periodsLabel(periods) {
  if (!Array.isArray(periods) || !periods.length) return "-";
  return periods.map((value) => {
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(String(value));
    return match ? `${periodNames[Number(match[2]) - 1]} ${match[1]}` : "-";
  }).join(", ");
}

function compactPeriodsLabel(periods) {
  if (!Array.isArray(periods) || !periods.length) return "-";
  return periods.map((value) => {
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(String(value));
    return match ? `${periodNames[Number(match[2]) - 1].toUpperCase()}${match[1].slice(-2)}` : "-";
  }).join("/");
}

function receiptPrintMonth(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "numeric", year: "2-digit", timeZone: "Asia/Jakarta",
  }).formatToParts(parsed).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const monthIndex = Number(parts.month) - 1;
  return receiptMonthNames[monthIndex] ? `${receiptMonthNames[monthIndex]} ${parts.year}` : "-";
}

function printCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 10).toString()).join("");
}

function receiptUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeReceipt(row, now = new Date()) {
  const base = Number(row.rptag);
  const admin = Number(row.admin_fee);
  if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(admin) || admin < 0 || !Number.isSafeInteger(base + admin)) {
    throw new Error("Nilai tagihan tidak valid.");
  }
  return {
    ...row,
    rptag: base,
    admin_fee: admin,
    total: base + admin,
    printedAt: now.toISOString(),
    historyId: receiptUuid(),
    printId: printCode(),
    printReference: printCode() + printCode() + printCode(),
  };
}

function receiptHistorySnapshot(receipt) {
  const historyId = String(receipt.historyId || "");
  const printedAt = new Date(receipt.printedAt);
  const base = Number(receipt.rptag);
  const admin = Number(receipt.admin_fee);
  const total = Number(receipt.total);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(historyId)
    || Number.isNaN(printedAt.getTime()) || !/^\d{10,16}$/.test(String(receipt.idpel || ""))
    || !Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(admin) || admin < 0
    || total !== base + admin || !String(receipt.printId || "") || !String(receipt.printReference || "")) {
    throw new Error("Data struk belum valid untuk disimpan ke riwayat.");
  }
  const storedReceipt = {
    historyId,
    idpel: String(receipt.idpel),
    nama: String(receipt.nama || "-"),
    tarif: String(receipt.tarif || "-"),
    daya: String(receipt.daya || "-"),
    rptag: base,
    admin_fee: admin,
    total,
    stand_awal: String(receipt.stand_awal || ""),
    stand_akhir: String(receipt.stand_akhir || ""),
    billing_periods: Array.isArray(receipt.billing_periods) ? receipt.billing_periods.map(String).slice(0, 24) : [],
    nama_toko: String(receipt.nama_toko || "PLN MOBILE"),
    alamat_toko: String(receipt.alamat_toko || "PLN ULP SABAK"),
    printedAt: printedAt.toISOString(),
    printId: String(receipt.printId),
    printReference: String(receipt.printReference),
  };
  return {
    id: historyId,
    format_version: 1,
    source: "monalisa_web",
    printed_at: storedReceipt.printedAt,
    sent_at: storedReceipt.printedAt,
    transaction_id: storedReceipt.printId,
    reference: storedReceipt.printReference,
    idpel: storedReceipt.idpel,
    customer_name: storedReceipt.nama,
    base_amount: base,
    extra_amount: admin,
    admin_amount: 0,
    total_amount: total,
    print_text: [storedReceipt.idpel, storedReceipt.nama, storedReceipt.printReference, String(total)].join(" | "),
    web_receipt: storedReceipt,
  };
}

function receiptFromHistorySnapshot(snapshot) {
  const stored = snapshot?.web_receipt;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    throw new Error("Riwayat ini berasal dari format lain dan belum dapat dicetak ulang di web.");
  }
  const receipt = {
    ...stored,
    rptag: Number(stored.rptag),
    admin_fee: Number(stored.admin_fee),
    total: Number(stored.total),
    historyId: String(snapshot.id || stored.historyId || ""),
    printedAt: String(stored.printedAt || snapshot.printed_at || ""),
    printId: String(stored.printId || snapshot.transaction_id || ""),
    printReference: String(stored.printReference || snapshot.reference || ""),
  };
  receiptHistorySnapshot(receipt);
  return receipt;
}

function receiptField(label, value) {
  return `<div class="receipt-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`;
}

function receiptReferenceField(value) {
  const chunks = String(value || "-").match(/.{1,23}/g) || ["-"];
  return `<div class="receipt-row"><dt>NO REF</dt><dd class="receipt-reference-value">${chunks.map(escapeHtml).join("<br>")}</dd></div>`;
}

function safeLogoData(value) {
  return typeof value === "string" && value.length < 700000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : "";
}

function receiptMarkup(receipt, logoData = "") {
  const stand = [receipt.stand_awal, receipt.stand_akhir].filter((value) => String(value || "").trim()).join(" - ") || "-";
  const period = receiptPrintMonth(receipt.printedAt);
  const logo = safeLogoData(logoData);
  return `<article class="receipt">
    <div class="receipt-head">
      <div class="receipt-brand">${logo ? `<img class="receipt-logo" src="${logo}" alt="Logo struk" />` : `<span class="receipt-logo-fallback">${escapeHtml(receipt.nama_toko || "MONALISA")}</span>`}</div>
      <time>${escapeHtml(receiptHeaderTime(receipt.printedAt))}</time>
      <h2>STRUK PEMBAYARAN TAGIHAN<br />LISTRIK</h2>
    </div>
    <dl class="receipt-details">
      ${receiptField("ID PELANGGAN", receipt.idpel)}
      ${receiptField("NAMA", receipt.nama)}
      ${receiptField("TARIF/DAYA", `${receipt.tarif || "-"}/${receipt.daya || "-"} VA`)}
      ${receiptField("RP TAG PLN", receiptMoney(receipt.rptag))}
      ${receiptReferenceField(receipt.printReference)}
      ${receiptField("BL/TH", period)}
      ${receiptField("STAND METER", stand)}
      ${receiptField("BIAYA ADMIN PAYMENT CHANNEL", receiptMoney(receipt.admin_fee))}
      <div class="receipt-row receipt-total"><dt>TOTAL BAYAR</dt><dd>${receiptMoney(receipt.total)}</dd></div>
    </dl>
    <div class="receipt-attestation"><strong>STRUK INI SEBAGAI BUKTI YANG SAH</strong><span>MOHON DI SIMPAN</span></div>
    <div class="receipt-foot"><strong>TERIMA KASIH</strong><span>DOWNLOAD PLN MOBILE</span></div>
  </article>`;
}

function printSheets(receipts, logoData = "") {
  let html = "";
  for (let index = 0; index < receipts.length; index += 2) {
    html += `<section class="print-sheet"><div class="receipt-slot">${receiptMarkup(receipts[index], logoData)}</div>`;
    html += receipts[index + 1] ? `<div class="receipt-slot">${receiptMarkup(receipts[index + 1], logoData)}</div>` : `<div class="receipt-slot receipt-slot-empty"></div>`;
    html += "</section>";
  }
  return html;
}

function prepareCustomers(ids, customers, meters, settings) {
  const meterById = new Map(meters.map((meter) => [meter.idpel, meter]));
  const customerById = new Map();
  for (const row of customers) {
    if (!ids.includes(row.idpel) || Number(row.rptag) <= 0) continue;
    const previous = customerById.get(row.idpel);
    if (!previous || String(row.uploaded_at || "") > String(previous.uploaded_at || "")) customerById.set(row.idpel, row);
  }
  return ids.filter((id) => customerById.has(id)).map((id) => ({
    ...customerById.get(id),
    stand_awal: meterById.get(id)?.stand_awal || "",
    stand_akhir: meterById.get(id)?.stand_akhir || "",
    admin_fee: settings?.admin_fee ?? 5000,
    nama_toko: settings?.nama_toko || "PLN MOBILE",
    alamat_toko: settings?.alamat_toko || "PLN ULP SABAK",
  }));
}

async function lookupCustomers(client, ids, role) {
  const { data, error } = await client.rpc("lookup_receipt_customers", { p_idpels: ids });
  if (error) throw error;
  return data || [];
}

function initPublicReceipt() {
  const elements = {
    authGate: document.querySelector("#authGate"), loginForm: document.querySelector("#loginForm"),
    loginEmail: document.querySelector("#loginEmail"), loginPassword: document.querySelector("#loginPassword"),
    authTitle: document.querySelector("#authTitle"), authIntro: document.querySelector("#authIntro"),
    forgotPasswordButton: document.querySelector("#forgotPasswordButton"),
    recoveryRequestForm: document.querySelector("#recoveryRequestForm"),
    recoveryEmail: document.querySelector("#recoveryEmail"),
    backToLoginButton: document.querySelector("#backToLoginButton"),
    newPasswordForm: document.querySelector("#newPasswordForm"),
    newPassword: document.querySelector("#newPassword"), confirmPassword: document.querySelector("#confirmPassword"),
    authStatus: document.querySelector("#authStatus"), receiptWorkspace: document.querySelector("#receiptWorkspace"),
    sessionLabel: document.querySelector("#sessionLabel"), logoutButton: document.querySelector("#logoutButton"),
    dashboardLink: document.querySelector("#dashboardLink"), accountButton: document.querySelector("#accountButton"),
    accountInitials: document.querySelector("#accountInitials"), accountMenu: document.querySelector("#accountMenu"),
    accountSettingsToggle: document.querySelector("#accountSettingsToggle"), accountSettingsMenu: document.querySelector("#accountSettingsMenu"),
    singleTab: document.querySelector("#singleTab"), bulkTab: document.querySelector("#bulkTab"),
    singleMode: document.querySelector("#singleMode"), bulkMode: document.querySelector("#bulkMode"),
    singleIdpel: document.querySelector("#singleIdpel"), bulkIdpels: document.querySelector("#bulkIdpels"),
    bulkCount: document.querySelector("#bulkCount"), form: document.querySelector("#lookupForm"),
    status: document.querySelector("#lookupStatus"), results: document.querySelector("#results"),
    summary: document.querySelector("#resultsSummary"), rows: document.querySelector("#resultRows"),
    missing: document.querySelector("#missingIds"), selectAll: document.querySelector("#selectAll"),
    printSelected: document.querySelector("#printSelected"), printLabel: document.querySelector("#printLabel"),
    dialog: document.querySelector("#receiptPreview"), preview: document.querySelector("#previewContent"),
    closePreview: document.querySelector("#closePreview"), printPreview: document.querySelector("#printPreview"),
    printArea: document.querySelector("#printArea"),
    logoFile: document.querySelector("#logoFile"), logoPreview: document.querySelector("#logoPreview"),
    logoPlaceholder: document.querySelector("#logoPlaceholder"), logoStatus: document.querySelector("#logoStatus"),
    uploadLogo: document.querySelector("#uploadLogo"), removeLogo: document.querySelector("#removeLogo"),
    adminFeeForm: document.querySelector("#adminFeeForm"), adminFeeInput: document.querySelector("#adminFeeInput"),
    adminFeeStatus: document.querySelector("#adminFeeStatus"),
    newPrintTab: document.querySelector("#newPrintTab"), historyTab: document.querySelector("#historyTab"),
    printView: document.querySelector("#printView"), historyView: document.querySelector("#historyView"),
    historyMonth: document.querySelector("#historyMonth"), historySearch: document.querySelector("#historySearch"),
    historyRefresh: document.querySelector("#historyRefresh"), historyStatus: document.querySelector("#historyStatus"),
    historyRows: document.querySelector("#historyRows"), historyPage: document.querySelector("#historyPage"),
    historyPrev: document.querySelector("#historyPrev"), historyNext: document.querySelector("#historyNext"),
  };
  if (!elements.form) return;
  const authFragment = new URLSearchParams(window.location.hash.slice(1));
  const config = window.MONITORING_SUPABASE || {};
  const client = config.url && config.anonKey && window.supabase?.createClient(config.url, config.anonKey);
  let identity = null;
  let mode = "single";
  let receipts = [];
  let resultIds = [];
  let selected = new Set();
  let previewId = "";
  let viewVersion = 0;
  let workspaceView = "print";
  let historyOffset = 0;
  let historyTotal = 0;
  let historyRevision = 0;
  let historySearchTimer = 0;
  let printBusy = false;
  const printedHistoryIds = new Set();
  const recoveryStorageKey = "simontok-receipt-recovery-user";
  let recoveryLinkOpened = authFragment.get("type") === "recovery" || authFragment.has("error_code");
  let recoveryMode = false;
  const logoStorageKey = "simontok-receipt-logo-v1";
  const adminFeeStorageKey = "monalisa-receipt-admin-fee-v1";
  let logoData = "";
  let adminFee = 5000;
  try { logoData = safeLogoData(localStorage.getItem(logoStorageKey)); } catch { /* Browser storage may be disabled. */ }
  try {
    const savedAdminFee = localStorage.getItem(adminFeeStorageKey);
    if (savedAdminFee !== null) adminFee = parseAdminFee(savedAdminFee);
  } catch { /* Keep the standard fee when browser storage is unavailable or invalid. */ }

  const monthParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" })
    .formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  elements.historyMonth.value = `${monthParts.year}-${monthParts.month}`;

  function showLogo(message = "Logo disimpan di browser perangkat ini.") {
    elements.logoPreview.hidden = !logoData;
    elements.logoPlaceholder.hidden = !!logoData;
    elements.removeLogo.hidden = !logoData;
    if (logoData) elements.logoPreview.src = logoData;
    else elements.logoPreview.removeAttribute("src");
    elements.logoStatus.textContent = message;
  }
  showLogo();

  function showAdminFee(message = `Aktif: ${money(adminFee)} per struk.`) {
    elements.adminFeeInput.value = String(adminFee);
    elements.adminFeeStatus.textContent = message;
    elements.adminFeeStatus.classList.remove("is-error");
  }
  showAdminFee();

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", isError);
  }

  function closeAccountMenu() {
    elements.accountMenu.hidden = true;
    elements.accountButton.setAttribute("aria-expanded", "false");
    elements.accountSettingsMenu.hidden = true;
    elements.accountSettingsToggle.setAttribute("aria-expanded", "false");
  }

  function initials(value) {
    const source = String(value || "MONALISA").split("@")[0].trim();
    const parts = source.split(/[\s._-]+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2)).toUpperCase();
  }

  function setHistoryStatus(message, isError = false) {
    elements.historyStatus.textContent = message;
    elements.historyStatus.classList.toggle("is-error", isError);
  }

  function setWorkspaceView(next, load = true) {
    workspaceView = next === "history" ? "history" : "print";
    elements.printView.hidden = workspaceView !== "print";
    elements.historyView.hidden = workspaceView !== "history";
    elements.newPrintTab.setAttribute("aria-selected", String(workspaceView === "print"));
    elements.historyTab.setAttribute("aria-selected", String(workspaceView === "history"));
    if (workspaceView === "history" && load) loadHistory(true);
  }

  function renderHistory(rows) {
    elements.historyRows.innerHTML = rows.map((row) => {
      const adminAmount = Number(row.extra_amount || 0) + Number(row.admin_amount || 0);
      return `<tr>
        <td>${escapeHtml(receiptTime(row.printed_at))}</td>
        <td><strong>${escapeHtml(row.idpel)}</strong><small>${escapeHtml(row.customer_name || "-")}</small></td>
        <td>${money(Number(row.base_amount))}</td>
        <td>${money(adminAmount)}</td>
        <td><strong>${money(Number(row.total_amount))}</strong></td>
        <td>${Number(row.reprint_count || 0).toLocaleString("id-ID")} kali</td>
        <td><button type="button" class="secondary-command history-reprint" data-history-id="${escapeHtml(row.id)}"><i data-lucide="printer" aria-hidden="true"></i>Cetak ulang</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7">Belum ada riwayat cetak pada bulan ini.</td></tr>';
    elements.historyPage.textContent = historyTotal
      ? `${historyOffset + 1}-${Math.min(historyOffset + rows.length, historyTotal)} dari ${historyTotal} struk`
      : "0 struk";
    elements.historyPrev.disabled = historyOffset === 0;
    elements.historyNext.disabled = historyOffset + rows.length >= historyTotal;
    window.lucide?.createIcons();
  }

  async function loadHistory(resetPage = true) {
    if (!identity || !client) return;
    if (resetPage) historyOffset = 0;
    const month = elements.historyMonth.value;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setHistoryStatus("Pilih bulan riwayat yang valid.", true);
      return;
    }
    const version = ++historyRevision;
    const userId = identity.user.id;
    setHistoryStatus("Memuat riwayat cetak...");
    elements.historyRefresh.disabled = true;
    elements.historyPrev.disabled = true;
    elements.historyNext.disabled = true;
    try {
      const { data, error } = await client.rpc("list_receipt_history", {
        p_month: `${month}-01`,
        p_query: elements.historySearch.value.trim(),
        p_offset: historyOffset,
        p_limit: 25,
        p_user_id: userId,
        p_petugas: null,
      });
      if (error) throw error;
      if (version !== historyRevision || identity?.user?.id !== userId) return;
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      historyTotal = Number(data?.total || 0);
      renderHistory(rows);
      setHistoryStatus(historyTotal
        ? `${historyTotal.toLocaleString("id-ID")} struk tersimpan. Cetak ulang tidak mengubah data aslinya.`
        : "Belum ada struk tersimpan pada bulan ini.");
    } catch (error) {
      if (version !== historyRevision || identity?.user?.id !== userId) return;
      historyTotal = 0;
      renderHistory([]);
      setHistoryStatus(`${error.message || "Riwayat tidak dapat dimuat."} Pastikan migrasi riwayat cetak sudah diterapkan.`, true);
    } finally {
      if (version === historyRevision) elements.historyRefresh.disabled = false;
    }
  }

  function showGate(message, isError = false, view = "login") {
    identity = null;
    historyRevision++;
    historyOffset = 0;
    historyTotal = 0;
    printedHistoryIds.clear();
    setWorkspaceView("print", false);
    setMode("single");
    elements.singleIdpel.value = "";
    elements.bulkIdpels.value = "";
    elements.bulkCount.textContent = `0 / ${PUBLIC_RECEIPT_LIMIT} IDPEL`;
    elements.missing.textContent = "";
    elements.summary.textContent = "";
    elements.rows.innerHTML = "";
    elements.printArea.innerHTML = "";
    elements.preview.innerHTML = "";
    resultIds = [];
    previewId = "";
    if (elements.dialog.open) elements.dialog.close();
    elements.receiptWorkspace.hidden = true;
    elements.authGate.hidden = false;
    closeAccountMenu();
    elements.accountButton.hidden = true;
    elements.sessionLabel.hidden = true;
    elements.logoutButton.hidden = true;
    elements.dashboardLink.hidden = false;
    elements.authTitle.textContent = view === "reset" ? "Buat password baru" : view === "forgot" ? "Lupa password" : "Masuk ke MONALISA";
    elements.authIntro.textContent = view === "reset"
      ? "Masukkan password baru untuk akun cetak struk Anda."
      : view === "forgot" ? "Kami akan mengirim tautan pemulihan ke email akun Anda."
      : "Masuk dengan akun cetak struk dari admin. Admin dan petugas MONALISA juga dapat memakai halaman ini.";
    elements.loginForm.hidden = view !== "login";
    elements.forgotPasswordButton.hidden = view !== "login";
    elements.recoveryRequestForm.hidden = view !== "forgot";
    elements.newPasswordForm.hidden = view !== "reset";
    elements.authStatus.textContent = message;
    elements.authStatus.classList.toggle("is-error", isError);
  }

  async function restoreAuth() {
    if (!client) { showGate("Layanan akun belum tersedia. Coba muat ulang halaman.", true); return; }
    const version = ++viewVersion;
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (version !== viewVersion) return;
      if (recoveryLinkOpened || recoveryMode || sessionStorage.getItem(recoveryStorageKey)) {
        const expectedUserId = sessionStorage.getItem(recoveryStorageKey);
        if (authFragment.has("error_code") || userError || !userData?.user || (expectedUserId && expectedUserId !== userData.user.id)) {
          sessionStorage.removeItem(recoveryStorageKey);
          recoveryMode = false;
          recoveryLinkOpened = false;
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          showGate("Tautan pemulihan tidak berlaku lagi. Minta tautan baru.", true, "forgot");
        } else {
          recoveryMode = true;
          recoveryLinkOpened = false;
          sessionStorage.setItem(recoveryStorageKey, userData.user.id);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          showGate("Buat password baru, lalu masuk kembali.", false, "reset");
        }
        return;
      }
      if (userError || !userData?.user) { showGate("Masuk dengan akun MONALISA untuk melanjutkan."); return; }
      const { data: accountProfile, error: profileError } = await client.from("monitoring_profiles")
        .select("role,petugas,email").eq("user_id", userData.user.id).maybeSingle();
      if (version !== viewVersion) return;
      if (recoveryMode) return;
      if (profileError) { showGate("Profil akun tidak dapat dibaca. Coba lagi nanti.", true); return; }
      let profile = accountProfile;
      if (!profile) {
        const { data: operator, error: operatorError } = await client.from("monitoring_receipt_operators")
          .select("user_id,email").eq("user_id", userData.user.id).maybeSingle();
        if (version !== viewVersion) return;
        if (operatorError) { showGate("Izin akun cetak tidak dapat dibaca. Coba lagi nanti.", true); return; }
        if (operator) profile = { role: "receipt_operator", email: operator.email, petugas: "" };
      }
      if (!profile || !["admin", "petugas", "receipt_operator"].includes(profile.role) || (profile.role === "petugas" && !profile.petugas)) {
        showGate("Profil akun belum memiliki izin cetak. Hubungi admin MONALISA.", true);
        return;
      }
      identity = { user: userData.user, profile };
      elements.authGate.hidden = true;
      elements.receiptWorkspace.hidden = false;
      elements.sessionLabel.textContent = profile.petugas || profile.email || userData.user.email || "MONALISA";
      elements.sessionLabel.hidden = false;
      elements.logoutButton.hidden = false;
      elements.dashboardLink.hidden = profile.role === "receipt_operator";
      elements.accountInitials.textContent = initials(profile.petugas || profile.email || userData.user.email);
      elements.accountButton.hidden = false;
      setStatus("Masukkan IDPEL untuk memeriksa tagihan.");
    } catch {
      if (version === viewVersion) showGate("Gagal memeriksa akun. Periksa koneksi lalu muat ulang halaman.", true);
    }
  }

  function setMode(next) {
    viewVersion++;
    mode = next;
    elements.singleMode.hidden = mode !== "single";
    elements.bulkMode.hidden = mode !== "bulk";
    elements.singleTab.setAttribute("aria-selected", String(mode === "single"));
    elements.bulkTab.setAttribute("aria-selected", String(mode === "bulk"));
    elements.results.hidden = true;
    receipts = [];
    resultIds = [];
    selected = new Set();
    setStatus("Belum ada tagihan yang diperiksa.");
  }

  function renderResults(ids, found) {
    resultIds = [...ids];
    receipts = found;
    selected = new Set(found.map((row) => row.idpel));
    const missing = ids.filter((id) => !selected.has(id));
    elements.results.hidden = false;
    elements.summary.textContent = `${found.length} dari ${ids.length} IDPEL siap dibuatkan struk pembayaran.`;
    elements.missing.hidden = !missing.length;
    elements.missing.textContent = missing.length ? `Tidak ditemukan atau sudah lunas: ${missing.join(", ")}` : "";
    elements.rows.innerHTML = found.map((row) => `<tr>
      <td><input type="checkbox" data-select="${row.idpel}" aria-label="Pilih ${row.idpel}" checked /></td>
      <td><strong>${escapeHtml(row.idpel)}</strong><small>${escapeHtml(row.nama || "-")}</small></td>
      <td>${escapeHtml(`${row.tarif || "-"}/${row.daya || "-"}`)}</td>
      <td>${escapeHtml([row.stand_awal, row.stand_akhir].filter(Boolean).join("-") || "-")}</td>
      <td>${money(row.rptag)}</td><td>${money(row.admin_fee)}</td><td><strong>${money(row.total)}</strong></td>
      <td><button type="button" class="row-action" data-preview="${row.idpel}">Lihat struk</button></td>
    </tr>`).join("");
    updateSelection();
  }

  function updateSelection() {
    elements.selectAll.checked = receipts.length > 0 && selected.size === receipts.length;
    elements.selectAll.indeterminate = selected.size > 0 && selected.size < receipts.length;
    elements.printSelected.disabled = selected.size === 0 || printBusy;
    elements.printLabel.textContent = mode === "bulk" ? `Cetak kolektif (${selected.size})` : "Cetak struk";
  }

  async function saveReceiptHistory(receipt) {
    const { error } = await client.rpc("save_receipt_history", { p_snapshot: receiptHistorySnapshot(receipt) });
    if (error) throw error;
  }

  async function recordReceiptReprint(receiptId) {
    const { error } = await client.rpc("record_receipt_reprint", {
      p_event_id: receiptUuid(),
      p_receipt_id: receiptId,
      p_printed_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function doPrint(items) {
    if (!items.length || !identity || !client || printBusy) return;
    printBusy = true;
    updateSelection();
    elements.printPreview.disabled = true;
    setStatus(`Menyimpan ${items.length} struk ke riwayat...`);
    try {
      const reprintIds = new Set(items.filter((item) => printedHistoryIds.has(item.historyId)).map((item) => item.historyId));
      await Promise.all(items.map((item) => saveReceiptHistory(item)));
      await Promise.all([...reprintIds].map((id) => recordReceiptReprint(id)));
      items.forEach((item) => printedHistoryIds.add(item.historyId));
      elements.printArea.innerHTML = printSheets(items, logoData);
      setStatus(`${items.length} struk tersimpan di riwayat dan siap dicetak.`);
      window.print();
    } catch (error) {
      setStatus(`Struk belum dicetak: ${error.message || "gagal menyimpan riwayat."}`, true);
    } finally {
      printBusy = false;
      elements.printPreview.disabled = false;
      updateSelection();
    }
  }

  async function reprintHistory(receiptId, button) {
    if (!identity || !client || printBusy) return;
    printBusy = true;
    button.disabled = true;
    setHistoryStatus("Mengambil data cetakan pertama...");
    try {
      const { data: snapshot, error: snapshotError } = await client.rpc("get_receipt_snapshot", { p_id: receiptId });
      if (snapshotError) throw snapshotError;
      const receipt = receiptFromHistorySnapshot(snapshot);
      await recordReceiptReprint(receiptId);
      elements.printArea.innerHTML = printSheets([receipt], logoData);
      setHistoryStatus(`Struk ${receipt.idpel} memakai data cetakan pertama dan siap dicetak ulang.`);
      window.print();
      await loadHistory(false);
    } catch (error) {
      setHistoryStatus(`Cetak ulang gagal: ${error.message || "riwayat tidak dapat dibaca."}`, true);
    } finally {
      printBusy = false;
      button.disabled = false;
    }
  }

  elements.accountButton.addEventListener("click", () => {
    const open = elements.accountMenu.hidden;
    closeAccountMenu();
    elements.accountMenu.hidden = !open;
    elements.accountButton.setAttribute("aria-expanded", String(open));
  });
  elements.accountSettingsToggle.addEventListener("click", () => {
    const open = elements.accountSettingsMenu.hidden;
    elements.accountSettingsMenu.hidden = !open;
    elements.accountSettingsToggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-shell")) closeAccountMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAccountMenu();
  });
  elements.uploadLogo.addEventListener("click", () => elements.logoFile.click());
  elements.logoFile.addEventListener("change", () => {
    const file = elements.logoFile.files?.[0];
    elements.logoFile.value = "";
    if (!file) return;
    if (!/^image\/(?:png|jpeg|webp)$/.test(file.type) || file.size > 350000) {
      showLogo("Gunakan PNG, JPG, atau WebP berukuran maksimal 350 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const nextLogo = safeLogoData(reader.result);
      if (!nextLogo) { showLogo("File logo tidak dapat dibaca."); return; }
      try {
        localStorage.setItem(logoStorageKey, nextLogo);
        logoData = nextLogo;
        showLogo("Logo siap dipakai untuk pratinjau dan cetak di browser ini.");
        if (elements.dialog.open) {
          const receipt = receipts.find((row) => row.idpel === previewId);
          if (receipt) elements.preview.innerHTML = receiptMarkup(receipt, logoData);
        }
      } catch { showLogo("Penyimpanan browser penuh. Coba logo yang lebih kecil."); }
    };
    reader.onerror = () => showLogo("File logo tidak dapat dibaca.");
    reader.readAsDataURL(file);
  });
  elements.removeLogo.addEventListener("click", () => {
    try { localStorage.removeItem(logoStorageKey); } catch { /* Preview still clears. */ }
    logoData = "";
    showLogo("Logo dihapus dari browser ini.");
    if (elements.dialog.open) {
      const receipt = receipts.find((row) => row.idpel === previewId);
      if (receipt) elements.preview.innerHTML = receiptMarkup(receipt);
    }
  });
  elements.adminFeeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const nextAdminFee = parseAdminFee(elements.adminFeeInput.value);
      localStorage.setItem(adminFeeStorageKey, String(nextAdminFee));
      adminFee = nextAdminFee;
      if (receipts.length) {
        const currentSelection = new Set(selected);
        const updatedReceipts = receipts.map((row) => {
          const updated = updateReceiptAdminFee(row, adminFee);
          return printedHistoryIds.has(row.historyId) ? makeReceipt(updated) : updated;
        });
        renderResults(resultIds, updatedReceipts);
        selected = currentSelection;
        elements.rows.querySelectorAll("[data-select]").forEach((input) => { input.checked = selected.has(input.dataset.select); });
        updateSelection();
        if (elements.dialog.open) {
          const receipt = receipts.find((row) => row.idpel === previewId);
          if (receipt) elements.preview.innerHTML = receiptMarkup(receipt, logoData);
        }
      }
      showAdminFee(`Tersimpan: ${money(adminFee)} per struk.`);
    } catch (error) {
      elements.adminFeeStatus.textContent = error.message || "Biaya admin belum tersimpan.";
      elements.adminFeeStatus.classList.add("is-error");
    }
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) { showGate("Layanan akun belum tersedia. Coba muat ulang halaman.", true); return; }
    const button = elements.loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    elements.authStatus.textContent = "Masuk...";
    elements.authStatus.classList.remove("is-error");
    try {
      const { error } = await client.auth.signInWithPassword({
        email: elements.loginEmail.value.trim(), password: elements.loginPassword.value,
      });
      if (error) throw error;
      elements.loginPassword.value = "";
      await restoreAuth();
    } catch {
      showGate("Login gagal. Periksa email, password, dan koneksi internet.", true);
    } finally { button.disabled = false; }
  });
  elements.forgotPasswordButton.addEventListener("click", () => {
    elements.recoveryEmail.value = elements.loginEmail.value.trim();
    showGate("Masukkan email akun untuk menerima tautan pemulihan.", false, "forgot");
  });
  elements.backToLoginButton.addEventListener("click", () => showGate("Masuk dengan akun MONALISA untuk melanjutkan."));
  elements.recoveryRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) { showGate("Layanan akun belum tersedia. Coba muat ulang halaman.", true, "forgot"); return; }
    const button = elements.recoveryRequestForm.querySelector('button[type="submit"]');
    button.disabled = true;
    elements.authStatus.textContent = "Mengirim tautan...";
    elements.authStatus.classList.remove("is-error");
    try {
      const { error } = await client.auth.resetPasswordForEmail(elements.recoveryEmail.value.trim(), {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      });
      if (error) throw error;
      elements.authStatus.textContent = "Jika email terdaftar, tautan pemulihan akan dikirim. Periksa juga folder Spam.";
    } catch {
      elements.authStatus.textContent = "Gagal mengirim tautan. Periksa koneksi atau coba lagi nanti.";
      elements.authStatus.classList.add("is-error");
    } finally { button.disabled = false; }
  });
  elements.newPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (elements.newPassword.value !== elements.confirmPassword.value) {
      elements.authStatus.textContent = "Kedua password belum sama.";
      elements.authStatus.classList.add("is-error");
      return;
    }
    const button = elements.newPasswordForm.querySelector('button[type="submit"]');
    button.disabled = true;
    elements.authStatus.textContent = "Menyimpan password...";
    elements.authStatus.classList.remove("is-error");
    try {
      const { error } = await client.auth.updateUser({ password: elements.newPassword.value });
      if (error) throw error;
      elements.newPasswordForm.reset();
      sessionStorage.removeItem(recoveryStorageKey);
      recoveryMode = false;
      recoveryLinkOpened = false;
      try { await client.auth.signOut(); } catch { /* Password is already saved. */ }
      showGate("Password baru tersimpan. Masuk kembali dengan password tersebut.");
    } catch {
      elements.authStatus.textContent = "Password belum tersimpan. Gunakan password yang kuat atau minta tautan baru.";
      elements.authStatus.classList.add("is-error");
    } finally { button.disabled = false; }
  });
  elements.logoutButton.addEventListener("click", async () => {
    try {
      await client?.auth.signOut();
      showGate("Anda sudah keluar. Masuk kembali untuk mencetak.");
    } catch {
      setStatus("Gagal keluar. Periksa koneksi lalu coba lagi.", true);
    }
  });
  client?.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session?.user?.id) {
      recoveryMode = true;
      recoveryLinkOpened = false;
      sessionStorage.setItem(recoveryStorageKey, session.user.id);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      showGate("Buat password baru, lalu masuk kembali.", false, "reset");
    }
    if (event === "SIGNED_OUT") showGate("Anda sudah keluar. Masuk kembali untuk mencetak.");
  });

  elements.newPrintTab.addEventListener("click", () => setWorkspaceView("print"));
  elements.historyTab.addEventListener("click", () => setWorkspaceView("history"));
  elements.historyMonth.addEventListener("change", () => loadHistory(true));
  elements.historySearch.addEventListener("input", () => {
    clearTimeout(historySearchTimer);
    historySearchTimer = setTimeout(() => loadHistory(true), 300);
  });
  elements.historyRefresh.addEventListener("click", () => loadHistory(false));
  elements.historyPrev.addEventListener("click", () => {
    historyOffset = Math.max(0, historyOffset - 25);
    loadHistory(false);
  });
  elements.historyNext.addEventListener("click", () => {
    historyOffset += 25;
    loadHistory(false);
  });
  elements.historyRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-id]");
    if (button) reprintHistory(button.dataset.historyId, button);
  });
  elements.singleTab.addEventListener("click", () => setMode("single"));
  elements.bulkTab.addEventListener("click", () => setMode("bulk"));
  elements.bulkIdpels.addEventListener("input", () => {
    const count = elements.bulkIdpels.value.split(/[\s,;]+/).filter(Boolean).length;
    elements.bulkCount.textContent = `${count} / ${PUBLIC_RECEIPT_LIMIT} IDPEL`;
  });
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.results.hidden = true;
    if (!identity) { showGate("Masuk dengan akun MONALISA untuk melanjutkan."); return; }
    let ids;
    try { ids = parseIdpels(mode === "single" ? elements.singleIdpel.value : elements.bulkIdpels.value); }
    catch (error) { setStatus(error.message, true); return; }
    if (!client) { setStatus("Layanan tagihan belum tersedia. Coba muat ulang halaman.", true); return; }
    setStatus(`Memeriksa ${ids.length} IDPEL...`);
    const submit = elements.form.querySelector(`#${mode === "single" ? "singleMode" : "bulkMode"} button[type="submit"]`);
    const requestVersion = ++viewVersion;
    const requestUserId = identity.user.id;
    submit.disabled = true;
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (requestVersion !== viewVersion || identity?.user?.id !== requestUserId) return;
      if (userError || userData?.user?.id !== requestUserId) {
        showGate("Sesi akun berakhir. Masuk kembali untuk melanjutkan.", true);
        return;
      }
      const found = (await lookupCustomers(client, ids, identity.profile.role)).map((row) => makeReceipt(updateReceiptAdminFee(row, adminFee)));
      if (requestVersion !== viewVersion || identity?.user?.id !== requestUserId) return;
      renderResults(ids, found);
      setStatus(found.length ? `${found.length} data pembayaran siap. Periksa rinciannya sebelum mencetak.` : "Tidak ada data tagihan untuk IDPEL tersebut.");
    } catch (error) {
      if (requestVersion === viewVersion) setStatus("Gagal memeriksa tagihan. Periksa koneksi atau izin akun lalu coba lagi.", true);
    } finally { submit.disabled = false; }
  });
  elements.rows.addEventListener("change", (event) => {
    const id = event.target.dataset.select;
    if (!id) return;
    if (event.target.checked) selected.add(id); else selected.delete(id);
    updateSelection();
  });
  elements.rows.addEventListener("click", (event) => {
    const id = event.target.closest("[data-preview]")?.dataset.preview;
    const receipt = receipts.find((row) => row.idpel === id);
    if (!receipt) return;
    previewId = id;
    elements.preview.innerHTML = receiptMarkup(receipt, logoData);
    elements.dialog.showModal();
  });
  elements.selectAll.addEventListener("change", () => {
    selected = new Set(elements.selectAll.checked ? receipts.map((row) => row.idpel) : []);
    elements.rows.querySelectorAll("[data-select]").forEach((input) => { input.checked = selected.has(input.dataset.select); });
    updateSelection();
  });
  elements.printSelected.addEventListener("click", () => doPrint(receipts.filter((row) => selected.has(row.idpel))));
  elements.closePreview.addEventListener("click", () => elements.dialog.close());
  elements.printPreview.addEventListener("click", () => doPrint(receipts.filter((row) => row.idpel === previewId)));
  window.lucide?.createIcons();
  restoreAuth();
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initPublicReceipt);
if (typeof module !== "undefined") module.exports = { parseIdpels, escapeHtml, money, receiptMoney, parseAdminFee, updateReceiptAdminFee, receiptTime, receiptHeaderTime, periodsLabel, compactPeriodsLabel, receiptPrintMonth, receiptMarkup, printSheets, makeReceipt, receiptHistorySnapshot, receiptFromHistorySnapshot, prepareCustomers, lookupCustomers };
