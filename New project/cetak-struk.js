const PUBLIC_RECEIPT_LIMIT = 20;
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const periodNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

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

function receiptTime(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Asia/Jakarta",
  }).format(parsed);
}

function periodsLabel(periods) {
  if (!Array.isArray(periods) || !periods.length) return "-";
  return periods.map((value) => {
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(String(value));
    return match ? `${periodNames[Number(match[2]) - 1]} ${match[1]}` : "-";
  }).join(", ");
}

function printCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 10).toString()).join("");
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
    printId: printCode(),
    printReference: printCode() + printCode() + printCode(),
  };
}

function receiptField(label, value) {
  return `<div class="receipt-field"><span>${escapeHtml(label)}</span><span>:</span><span>${escapeHtml(value || "-")}</span></div>`;
}

function receiptMarkup(receipt) {
  const stand = [receipt.stand_awal, receipt.stand_akhir].filter((value) => String(value || "").trim()).join("-") || "-";
  const period = periodsLabel(receipt.billing_periods);
  return `<article class="receipt">
    <div class="receipt-head"><strong>${escapeHtml(receipt.nama_toko || "PLN MOBILE")}</strong><span>${escapeHtml(receipt.alamat_toko || "PLN ULP SABAK")}</span><span class="receipt-title">Struk Pembayaran Tagihan Listrik</span></div>
    <div class="receipt-warning">DATA TAGIHAN BELUM LUNAS - BUKAN BUKTI PEMBAYARAN</div>
    <div class="receipt-grid">
      ${receiptField("Tgl Cetak", receiptTime(receipt.printedAt))}
      ${receiptField("ID Cetak", receipt.printId)}
      ${receiptField("No Pelanggan", receipt.idpel)}
      ${receiptField("Nama", receipt.nama)}
      ${receiptField("Tarif/Daya", `${receipt.tarif || "-"}/${receipt.daya || "-"}`)}
      ${receiptField("Stand Meter", stand)}
      ${receiptField("Periode", period)}
      ${receiptField("Reff Cetak", receipt.printReference)}
    </div>
    <div class="receipt-section-title">Rincian Tagihan</div>
    <table class="receipt-money"><tbody>
      <tr><td>Rp Tagihan</td><td>${money(receipt.rptag)}</td></tr>
      <tr><td>Denda</td><td>${money(0)}</td></tr>
      <tr><td>Lain-Lain</td><td>${money(0)}</td></tr>
      <tr><td>Admin Bank</td><td>${money(receipt.admin_fee)}</td></tr>
      <tr class="receipt-total"><td>Total Bayar</td><td>${money(receipt.total)}</td></tr>
    </tbody></table>
    <div class="receipt-foot">Konfirmasi pembayaran melalui kanal resmi. Simpan struk pembayaran resmi setelah transaksi berhasil.</div>
  </article>`;
}

function printSheets(receipts) {
  let html = "";
  for (let index = 0; index < receipts.length; index += 2) {
    html += `<section class="print-sheet"><div class="receipt-slot">${receiptMarkup(receipts[index])}</div>`;
    html += receipts[index + 1] ? `<div class="receipt-slot">${receiptMarkup(receipts[index + 1])}</div>` : `<div class="receipt-slot receipt-slot-empty"></div>`;
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
  if (role === "receipt_operator") {
    const { data, error } = await client.rpc("lookup_receipt_operator_customers", { p_idpels: ids });
    if (error) throw error;
    return data || [];
  }
  const { data: customers, error: customerError } = await client.from("monitoring_remaining_customers")
    .select("*").eq("report_id", "main").in("idpel", ids);
  if (customerError) throw customerError;
  const visibleIds = [...new Set((customers || []).filter((row) => Number(row.rptag) > 0).map((row) => row.idpel))];
  if (!visibleIds.length) return [];
  const [meterResult, settingsResult] = await Promise.all([
    client.from("monitoring_receipt_meters").select("idpel,stand_awal,stand_akhir").eq("report_id", "main").in("idpel", visibleIds),
    client.from("monitoring_receipt_settings").select("admin_fee,nama_toko,alamat_toko").eq("id", "main").maybeSingle(),
  ]);
  if (meterResult.error) throw meterResult.error;
  if (settingsResult.error) throw settingsResult.error;
  return prepareCustomers(ids, customers || [], meterResult.data || [], settingsResult.data);
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
    dashboardLink: document.querySelector("#dashboardLink"),
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
  };
  if (!elements.form) return;
  const authFragment = new URLSearchParams(window.location.hash.slice(1));
  const config = window.MONITORING_SUPABASE || {};
  const client = config.url && config.anonKey && window.supabase?.createClient(config.url, config.anonKey);
  let identity = null;
  let mode = "single";
  let receipts = [];
  let selected = new Set();
  let previewId = "";
  let viewVersion = 0;
  const recoveryStorageKey = "simontok-receipt-recovery-user";
  let recoveryLinkOpened = authFragment.get("type") === "recovery" || authFragment.has("error_code");
  let recoveryMode = false;

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", isError);
  }

  function showGate(message, isError = false, view = "login") {
    identity = null;
    setMode("single");
    elements.singleIdpel.value = "";
    elements.bulkIdpels.value = "";
    elements.bulkCount.textContent = `0 / ${PUBLIC_RECEIPT_LIMIT} IDPEL`;
    elements.missing.textContent = "";
    elements.summary.textContent = "";
    elements.rows.innerHTML = "";
    elements.printArea.innerHTML = "";
    elements.preview.innerHTML = "";
    previewId = "";
    if (elements.dialog.open) elements.dialog.close();
    elements.receiptWorkspace.hidden = true;
    elements.authGate.hidden = false;
    elements.sessionLabel.hidden = true;
    elements.logoutButton.hidden = true;
    elements.dashboardLink.hidden = false;
    elements.authTitle.textContent = view === "reset" ? "Buat password baru" : view === "forgot" ? "Lupa password" : "Masuk ke SIMONTOK";
    elements.authIntro.textContent = view === "reset"
      ? "Masukkan password baru untuk akun cetak struk Anda."
      : view === "forgot" ? "Kami akan mengirim tautan pemulihan ke email akun Anda."
      : "Masuk dengan akun cetak struk dari admin. Admin dan petugas SIMONTOK juga dapat memakai halaman ini.";
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
      if (userError || !userData?.user) { showGate("Masuk dengan akun SIMONTOK untuk melanjutkan."); return; }
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
        showGate("Profil akun belum memiliki izin cetak. Hubungi admin SIMONTOK.", true);
        return;
      }
      identity = { user: userData.user, profile };
      elements.authGate.hidden = true;
      elements.receiptWorkspace.hidden = false;
      elements.sessionLabel.textContent = profile.petugas || profile.email || userData.user.email || "SIMONTOK";
      elements.sessionLabel.hidden = false;
      elements.logoutButton.hidden = false;
      elements.dashboardLink.hidden = profile.role === "receipt_operator";
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
    selected = new Set();
    setStatus("Belum ada tagihan yang diperiksa.");
  }

  function renderResults(ids, found) {
    receipts = found;
    selected = new Set(found.map((row) => row.idpel));
    const missing = ids.filter((id) => !selected.has(id));
    elements.results.hidden = false;
    elements.summary.textContent = `${found.length} dari ${ids.length} IDPEL ditemukan dalam saldo tunggakan terkini.`;
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
    elements.printSelected.disabled = selected.size === 0;
    elements.printLabel.textContent = mode === "bulk" ? `Cetak kolektif (${selected.size})` : "Cetak struk";
  }

  function doPrint(items) {
    if (!items.length || !identity) return;
    elements.printArea.innerHTML = printSheets(items);
    window.print();
  }

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
  elements.backToLoginButton.addEventListener("click", () => showGate("Masuk dengan akun SIMONTOK untuk melanjutkan."));
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

  elements.singleTab.addEventListener("click", () => setMode("single"));
  elements.bulkTab.addEventListener("click", () => setMode("bulk"));
  elements.bulkIdpels.addEventListener("input", () => {
    const count = elements.bulkIdpels.value.split(/[\s,;]+/).filter(Boolean).length;
    elements.bulkCount.textContent = `${count} / ${PUBLIC_RECEIPT_LIMIT} IDPEL`;
  });
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.results.hidden = true;
    if (!identity) { showGate("Masuk dengan akun SIMONTOK untuk melanjutkan."); return; }
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
      const found = (await lookupCustomers(client, ids, identity.profile.role)).map((row) => makeReceipt(row));
      if (requestVersion !== viewVersion || identity?.user?.id !== requestUserId) return;
      renderResults(ids, found);
      setStatus(found.length ? `${found.length} tagihan ditemukan. Periksa rinciannya sebelum mencetak.` : "Tidak ada tagihan ditemukan untuk IDPEL tersebut.");
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
    elements.preview.innerHTML = receiptMarkup(receipt);
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
if (typeof module !== "undefined") module.exports = { parseIdpels, escapeHtml, money, periodsLabel, receiptMarkup, printSheets, makeReceipt, prepareCustomers, lookupCustomers };
