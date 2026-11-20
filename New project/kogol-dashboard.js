(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SimontokKogolDashboard = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const TABLE = "monitoring_kogol_debt_snapshots";
  const GROUPS = [
    { key: "KOGOL_0", label: "Kogol 0", description: "Data dari Monitoring Tunggakan", color: "#087e8b" },
    { key: "KOGOL_3_PERKANTORAN", label: "Kogol 3 Perkantoran", description: "Selain SATKER LPJU Muara Sabak", color: "#245580" },
    { key: "KOGOL_3_LPJU", label: "Kogol 3 LPJU", description: "SATKER LPJU Muara Sabak", color: "#d99100" },
    { key: "KOGOL_4", label: "Kogol 4", description: "File Kogol 4", color: "#9a4f27" },
  ];

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function wibMonth(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}`;
  }

  function wibDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function validMonth(value) {
    return /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : wibMonth();
  }

  function formatMonth(value) {
    const month = validMonth(value);
    return new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(`${month}-01T00:00:00+07:00`));
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(`${value}T00:00:00+07:00`));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(number(value));
  }

  function formatPercent(value) {
    if (!Number.isFinite(Number(value))) return "-";
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(value))}%`;
  }

  function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      snapshotDate: String(row?.snapshot_date || row?.snapshotDate || "").slice(0, 10),
      kogolKey: String(row?.kogol_key || row?.kogolKey || "").trim().toUpperCase(),
      saldoId: Math.max(0, Math.round(number(row?.saldo_id ?? row?.saldoId))),
      saldoRupiah: Math.max(0, Math.round(number(row?.saldo_rupiah ?? row?.saldoRupiah))),
      sourceFile: String(row?.source_file || row?.sourceFile || ""),
      uploadedAt: row?.uploaded_at || row?.uploadedAt || null,
    })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.snapshotDate) && GROUPS.some((group) => group.key === row.kogolKey));
  }

  function buildSummary(rows, month) {
    const selectedMonth = validMonth(month);
    const normalized = normalizeRows(rows).filter((row) => row.snapshotDate.startsWith(`${selectedMonth}-`));
    return GROUPS.map((group) => {
      const snapshots = normalized
        .filter((row) => row.kogolKey === group.key)
        .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate) || String(a.uploadedAt || "").localeCompare(String(b.uploadedAt || "")));
      const opening = snapshots.find((row) => row.snapshotDate === `${selectedMonth}-01`) || null;
      const closing = snapshots[snapshots.length - 1] || null;
      const totalId = opening?.saldoId ?? 0;
      const totalRupiah = opening?.saldoRupiah ?? 0;
      const unpaidId = closing?.saldoId ?? 0;
      const unpaidRupiah = closing?.saldoRupiah ?? 0;
      const paidId = Math.max(0, totalId - unpaidId);
      const paidRupiah = Math.max(0, totalRupiah - unpaidRupiah);
      const rate = opening && snapshots.length > 1 && totalId > 0 ? (paidId * 100) / totalId : null;
      return {
        ...group,
        available: Boolean(closing),
        opening,
        closing,
        totalId,
        totalRupiah,
        paidId,
        paidRupiah,
        unpaidId,
        unpaidRupiah,
        rate,
        snapshotCount: snapshots.length,
      };
    });
  }

  function buildDonut(summary) {
    if (!summary.available) {
      return '<div class="kogol-empty">Belum ada data</div>';
    }
    const total = Math.max(1, summary.totalId);
    const paidRatio = summary.rate === null ? 0 : Math.max(0, Math.min(1, summary.paidId / total));
    const circumference = 2 * Math.PI * 42;
    const paidDash = Math.round(circumference * paidRatio * 10) / 10;
    const remainingDash = Math.max(0, circumference - paidDash);
    const rate = summary.rate === null ? "-" : formatPercent(summary.rate);
    return `<svg class="kogol-donut" viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(`${summary.label}: ${rate} IDPEL lunas`)}">
      <circle class="kogol-donut-track" cx="60" cy="60" r="42"></circle>
      <circle class="kogol-donut-paid" cx="60" cy="60" r="42" pathLength="${circumference}" stroke="${summary.color}" stroke-dasharray="${paidDash} ${remainingDash}" transform="rotate(-90 60 60)"></circle>
      <text x="60" y="56" text-anchor="middle" class="kogol-donut-rate">${escapeHtml(rate)}</text>
      <text x="60" y="71" text-anchor="middle" class="kogol-donut-caption">IDPEL Lunas</text>
    </svg>`;
  }

  function formatPeriod(summary) {
    if (!summary?.available || !summary.closing) return "Belum ada data";
    if (!summary.opening) return `Update: ${formatDate(summary.closing.snapshotDate)}`;
    if (summary.snapshotCount < 2) return `Saldo awal: ${formatDate(summary.opening.snapshotDate)}`;
    const start = summary.opening.snapshotDate;
    const end = summary.closing.snapshotDate;
    if (start.slice(0, 7) === end.slice(0, 7)) {
      return `Periode: ${start.slice(8, 10)}&ndash;${formatDate(end)}`;
    }
    return `Periode: ${formatDate(start)}&ndash;${formatDate(end)}`;
  }

  function buildCards(summaries) {
    const totalUnpaid = summaries.reduce((sum, summary) => sum + (summary.available ? summary.unpaidRupiah : 0), 0);
    const latestClosingDate = summaries.reduce((latest, summary) => summary.closing?.snapshotDate > latest ? summary.closing.snapshotDate : latest, "");
    return summaries.map((summary) => {
      const stale = Boolean(summary.closing?.snapshotDate && latestClosingDate && summary.closing.snapshotDate < latestClosingDate);
      const contribution = summary.available && totalUnpaid ? summary.unpaidRupiah * 100 / totalUnpaid : 0;
      const hasOpening = Boolean(summary.opening);
      return `
      <article class="kogol-card${summary.key === "KOGOL_0" ? " kogol-card-openable" : ""}${stale ? " is-stale" : ""}" data-kogol-key="${summary.key}"${summary.key === "KOGOL_0" ? ' role="button" tabindex="0" aria-label="Lihat rincian Kogol 0 per petugas"' : ""}>
        <div class="kogol-card-head">
          <h3>${escapeHtml(summary.label)}</h3>
          <div class="kogol-card-badges">
            <span class="kogol-snapshot-count">${summary.available ? `${summary.snapshotCount}x update` : "Belum upload"}</span>
            ${stale ? `<span class="kogol-stale-badge" title="Update terakhir ${escapeHtml(formatDate(summary.closing.snapshotDate))}; data terbaru unit ${escapeHtml(formatDate(latestClosingDate))}">Data tertinggal</span>` : ""}
          </div>
        </div>
        <div class="kogol-card-body">
          <div class="kogol-card-summary">
            ${buildDonut(summary)}
            <div class="kogol-card-figures">
              <span class="kogol-primary-label">Sisa Tunggakan</span>
              <strong class="kogol-primary-value">${summary.available ? formatRupiah(summary.unpaidRupiah) : "-"}</strong>
            </div>
          </div>
          <div class="kogol-breakdown">
            <div><span>Belum Lunas</span><b>${summary.available ? `${formatNumber(summary.unpaidId)} IDPEL` : "Belum tersedia"}</b></div>
            <div><span>Sudah Lunas</span><b>${summary.rate === null ? "Belum dihitung" : `${formatNumber(summary.paidId)} IDPEL`} ${summary.rate === null ? "" : `<small>(${formatRupiah(summary.paidRupiah)})</small>`}</b></div>
            <div><span>Total Saldo Awal</span><b>${hasOpening ? `${formatNumber(summary.totalId)} IDPEL <small>(${formatRupiah(summary.totalRupiah)})</small>` : "Belum tersedia"}</b></div>
          </div>
        </div>
        <div class="kogol-share">
          <div><span>Kontribusi thd Total Tunggakan</span><strong>${summary.available && totalUnpaid ? formatPercent(contribution) : "-"}</strong></div>
          <div class="kogol-share-track" role="progressbar" aria-label="Kontribusi ${escapeHtml(summary.label)} terhadap total tunggakan unit" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.available && totalUnpaid ? Math.round(contribution) : 0}"><i style="width:${summary.available && totalUnpaid ? Math.max(0, Math.min(100, contribution)) : 0}%"></i></div>
        </div>
        <footer><span class="kogol-period">${formatPeriod(summary)}</span>${summary.key === "KOGOL_0" ? '<span class="kogol-card-drill">Rincian petugas <i aria-hidden="true">&rarr;</i></span>' : ""}</footer>
      </article>
    `;
    }).join("");
  }

  function describeError(error) {
    const message = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" ");
    if (/monitoring_kogol_debt_snapshots|monitoring_kogol_receipt_customers|save_kogol_debt_(snapshot|upload)|schema cache|PGRST20/i.test(message)) {
      return "Database dashboard Kogol belum diaktifkan.";
    }
    return message || "Data Kogol tidak dapat dimuat.";
  }

  function create(options = {}) {
    const getState = options.getState || (() => ({}));
    const onMonthChange = options.onMonthChange || (() => {});
    const onRecordsChange = options.onRecordsChange || (() => {});
    const onOpenGroup = options.onOpenGroup || (() => {});
    const elements = {
      panel: document.querySelector("#kogolDashboardPanel"),
      month: document.querySelector("#kogolDashboardMonth"),
      status: document.querySelector("#kogolDashboardStatus"),
      cards: document.querySelector("#kogolDashboardCards"),
      refresh: document.querySelector("#kogolDashboardRefresh"),
    };
    let records = [];
    let requestId = 0;
    let contextKey = "";

    if (!elements.panel) {
      return {
        load: async () => null,
        saveSnapshots: async () => false,
        setMonth: () => {},
        syncContext: () => {},
        reset: () => {},
      };
    }

    elements.month.value = validMonth(elements.month.value);
    elements.month.max = wibMonth();
    elements.month.addEventListener("change", () => {
      const month = validMonth(elements.month.value);
      elements.month.value = month;
      onMonthChange(month);
      load();
    });
    elements.refresh?.addEventListener("click", () => load({ force: true }));
    elements.cards.addEventListener("click", (event) => {
      if (event.target.closest('[data-kogol-key="KOGOL_0"]')) {
        onOpenGroup(buildSummary(records, validMonth(elements.month.value))[0]);
      }
    });
    elements.cards.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.matches('[data-kogol-key="KOGOL_0"]')) {
        event.preventDefault();
        onOpenGroup(buildSummary(records, validMonth(elements.month.value))[0]);
      }
    });

    function syncContext() {
      const state = getState();
      const nextKey = `${state?.user?.id || ""}:${state?.profile?.role || ""}`;
      if (contextKey !== nextKey) {
        contextKey = nextKey;
        records = [];
        onRecordsChange([], validMonth(elements.month.value), false);
      }
      return {
        client: state?.supabaseClient || null,
        user: state?.user || null,
        isAdmin: state?.profile?.role === "admin",
      };
    }

    function render() {
      const month = validMonth(elements.month.value);
      const summaries = buildSummary(records, month);
      elements.cards.innerHTML = buildCards(summaries);
      const available = summaries.filter((item) => item.available).length;
      elements.status.textContent = available
        ? `${available} dari 4 kelompok memiliki snapshot pada ${formatMonth(month)}. Data terakhir ${formatDate(summaries.map((item) => item.closing?.snapshotDate || "").sort().at(-1))}.`
        : `Belum ada snapshot Kogol pada ${formatMonth(month)}.`;
    }

    async function load(options = {}) {
      const context = syncContext();
      const month = validMonth(elements.month.value);
      if (!context.client || !context.user || !context.isAdmin) {
        records = [];
        onRecordsChange([], month, false);
        elements.cards.innerHTML = '<div class="kogol-dashboard-empty">Login admin untuk memuat dashboard Kogol.</div>';
        elements.status.textContent = "Login admin diperlukan.";
        return null;
      }
      const request = ++requestId;
      if (!options.silent) elements.status.textContent = "Memuat snapshot Kogol...";
      const end = new Date(`${month}-01T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(0);
      let result;
      try {
        result = await context.client
          .from(TABLE)
          .select("snapshot_date,kogol_key,saldo_id,saldo_rupiah,source_file,uploaded_at")
          .gte("snapshot_date", `${month}-01`)
          .lte("snapshot_date", end.toISOString().slice(0, 10))
          .order("snapshot_date", { ascending: true });
      } catch (error) {
        result = { error };
      }
      if (request !== requestId) return null;
      if (result?.error) {
        records = [];
        onRecordsChange([], month, false);
        elements.cards.innerHTML = `<div class="kogol-dashboard-empty">${escapeHtml(describeError(result.error))}</div>`;
        elements.status.textContent = describeError(result.error);
        return null;
      }
      records = normalizeRows(result?.data || []);
      onRecordsChange(records, month, true);
      render();
      return records;
    }

    async function saveSnapshots(date, snapshots, sourceFile, receiptCustomers = []) {
      const context = syncContext();
      if (!context.client || !context.user || !context.isAdmin) return false;
      const snapshotDate = String(date || "").slice(0, 10);
      const rows = (Array.isArray(snapshots) ? snapshots : []).map((snapshot) => ({
        kogol_key: String(snapshot?.kogolKey || snapshot?.kogol_key || "").trim().toUpperCase(),
        saldo_id: Math.max(0, Math.round(number(snapshot?.saldoId ?? snapshot?.saldo_id))),
        saldo_rupiah: Math.max(0, Math.round(number(snapshot?.saldoRupiah ?? snapshot?.saldo_rupiah))),
      })).filter((snapshot) => GROUPS.some((group) => group.key === snapshot.kogol_key));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) || !rows.length) return false;
      const cleanFile = String(sourceFile || "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
      const customerRows = (Array.isArray(receiptCustomers) ? receiptCustomers : []).map((customer) => ({
        kogol_key: String(customer?.kogolKey || customer?.kogol_key || "").trim().toUpperCase(),
        idpel: String(customer?.idpel || "").replace(/\D/g, ""),
        nama: String(customer?.nama || "").trim().slice(0, 255),
        tarif: String(customer?.tarif || "").trim().slice(0, 64),
        daya: String(customer?.daya || "").trim().slice(0, 64),
        rptag: Math.max(0, Math.round(number(customer?.rptag))),
        billing_periods: Array.isArray(customer?.billingPeriods || customer?.billing_periods)
          ? (customer.billingPeriods || customer.billing_periods).slice(0, 24)
          : [],
        stand_awal: String(customer?.standAwal || customer?.stand_awal || "").trim().slice(0, 64),
        stand_akhir: String(customer?.standAkhir || customer?.stand_akhir || "").trim().slice(0, 64),
      })).filter((customer) => /^(KOGOL_3_PERKANTORAN|KOGOL_3_LPJU|KOGOL_4)$/.test(customer.kogol_key)
        && /^\d{10,16}$/.test(customer.idpel) && customer.rptag > 0);
      let result;
      try {
        result = await context.client.rpc(customerRows.length ? "save_kogol_debt_upload" : "save_kogol_debt_snapshot", {
          p_snapshot_date: snapshotDate,
          p_source_file: cleanFile,
          p_rows: rows,
          ...(customerRows.length ? { p_customers: customerRows } : {}),
        });
      } catch (error) {
        result = { error };
      }
      if (result?.error) {
        const message = describeError(result.error);
        elements.status.textContent = message;
        throw new Error(message);
      }
      if (snapshotDate.startsWith(`${validMonth(elements.month.value)}-`)) await load({ silent: true, force: true });
      return true;
    }

    function setMonth(month) {
      const normalized = validMonth(month);
      elements.month.value = normalized;
      onRecordsChange([], normalized, false);
      load({ silent: true });
    }

    function reset() {
      requestId += 1;
      contextKey = "";
      records = [];
      elements.month.value = wibMonth();
      onRecordsChange([], validMonth(elements.month.value), false);
      elements.cards.innerHTML = '<div class="kogol-dashboard-empty">Dashboard belum tersedia.</div>';
      elements.status.textContent = "Login admin untuk memuat dashboard Kogol.";
    }

    syncContext();
    render();
    return { load, saveSnapshots, setMonth, syncContext, reset };
  }

  return { GROUPS, normalizeRows, buildSummary, buildDonut, buildCards, create, wibMonth, wibDate, validMonth, formatMonth };
});
