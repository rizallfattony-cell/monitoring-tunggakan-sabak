(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SimontokDebtPerformance = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const ALLOWED_RANGES = new Set([1, 3, 4, 6, 12]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function currentWibMonth(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}`;
  }

  function monthFromTimestamp(value, fallback = currentWibMonth()) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return fallback;
    return currentWibMonth(date);
  }

  function formatMonth(value, long = false) {
    if (!/^\d{4}-\d{2}/.test(String(value || ""))) return "-";
    const date = new Date(`${String(value).slice(0, 7)}-01T00:00:00+07:00`);
    return new Intl.DateTimeFormat("id-ID", {
      month: long ? "long" : "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(date);
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(number(value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(value))}%`;
  }

  function normalizeHistoryPayload(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const rows = Array.isArray(source.rows) ? source.rows.map((row) => {
      const available = Boolean(row?.available);
      return {
        month: String(row?.month || "").slice(0, 10),
        available,
        officerCount: available ? number(row?.officer_count) : 0,
        awalId: available ? nullableNumber(row?.awal_id) : null,
        awalRupiah: available ? nullableNumber(row?.awal_rupiah) : null,
        akhirId: available ? nullableNumber(row?.akhir_id) : null,
        akhirRupiah: available ? nullableNumber(row?.akhir_rupiah) : null,
        pelunasanId: available ? nullableNumber(row?.pelunasan_id) : null,
        pelunasanRupiah: available ? nullableNumber(row?.pelunasan_rupiah) : null,
        persenId: available ? nullableNumber(row?.persen_id) : null,
        persenTagihan: available ? nullableNumber(row?.persen_tagihan) : null,
        capturedAt: available ? row?.captured_at || null : null,
      };
    }) : [];
    return {
      scope: String(source.scope || "ALL"),
      isAdmin: Boolean(source.is_admin),
      endMonth: String(source.end_month || "").slice(0, 10),
      months: ALLOWED_RANGES.has(Number(source.months)) ? Number(source.months) : rows.length || 6,
      officers: Array.isArray(source.officers)
        ? [...new Set(source.officers.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))]
        : [],
      rows,
    };
  }

  function buildHistorySummary(rows) {
    const available = (rows || []).filter((row) => row.available);
    const first = available[0] || null;
    const latest = available[available.length - 1] || null;
    const totalPaid = available.reduce((sum, row) => sum + number(row.pelunasanRupiah), 0);
    const average = available.length
      ? available.reduce((sum, row) => sum + number(row.persenTagihan), 0) / available.length
      : null;
    const change = first && latest && first !== latest
      ? number(latest.persenTagihan) - number(first.persenTagihan)
      : null;
    return { available, first, latest, totalPaid, average, change };
  }

  function buildHistoryChart(rows) {
    const normalized = rows || [];
    const availableValues = normalized
      .filter((row) => row.available && row.persenTagihan !== null)
      .map((row) => number(row.persenTagihan));
    if (!availableValues.length) {
      return '<div class="overview-history-empty">Belum ada snapshot pada periode ini.</div>';
    }

    const width = 920;
    const height = 278;
    const margin = { top: 24, right: 24, bottom: 46, left: 54 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const maximum = Math.max(100, Math.ceil(Math.max(...availableValues) / 10) * 10);
    const x = (index) => normalized.length === 1
      ? margin.left + innerWidth / 2
      : margin.left + (innerWidth * index) / Math.max(1, normalized.length - 1);
    const y = (value) => margin.top + innerHeight - (Math.max(0, Math.min(maximum, number(value))) / maximum) * innerHeight;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maximum * ratio));
    const grid = ticks.map((tick) => {
      const py = y(tick);
      return `<line x1="${margin.left}" y1="${py}" x2="${width - margin.right}" y2="${py}" stroke="#dfe7ec" stroke-width="1" />
        <text x="${margin.left - 10}" y="${py + 4}" fill="#748693" font-size="11" text-anchor="end">${tick}%</text>`;
    }).join("");

    const segments = [];
    let current = [];
    normalized.forEach((row, index) => {
      if (row.available && row.persenTagihan !== null) {
        current.push(`${x(index)},${y(row.persenTagihan)}`);
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length) segments.push(current);
    const lines = segments.map((points) => points.length > 1
      ? `<polyline points="${points.join(" ")}" fill="none" stroke="#087e8b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
      : "").join("");
    const points = normalized.map((row, index) => {
      if (!row.available || row.persenTagihan === null) return "";
      const label = `${formatMonth(row.month, true)}: ${formatPercent(row.persenTagihan)}`;
      return `<circle cx="${x(index)}" cy="${y(row.persenTagihan)}" r="5" fill="#fff" stroke="#087e8b" stroke-width="3"><title>${escapeHtml(label)}</title></circle>
        <text x="${x(index)}" y="${y(row.persenTagihan) - 11}" fill="#1e5362" font-size="11" font-weight="700" text-anchor="middle">${escapeHtml(formatPercent(row.persenTagihan))}</text>`;
    }).join("");
    const labels = normalized.map((row, index) => `<text x="${x(index)}" y="${height - 18}" fill="${row.available ? "#526a79" : "#9aa8b1"}" font-size="11" text-anchor="middle">${escapeHtml(formatMonth(row.month))}</text>`).join("");

    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${grid}
      <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="#aebdc6" stroke-width="1" />
      ${lines}${points}${labels}
    </svg>`;
  }

  function describeError(error) {
    const message = error?.message || error?.details || error?.hint || String(error || "");
    if (/get_debt_performance_history|save_debt_performance_snapshot|schema cache|PGRST202/i.test(message)) {
      return "Riwayat performa belum diaktifkan pada database.";
    }
    return message || "Riwayat performa tidak dapat dimuat.";
  }

  function create(options = {}) {
    const getState = options.getState || (() => ({}));
    const getOfficerNames = options.getOfficerNames || (() => []);
    const elements = {
      panel: document.querySelector("#debtPerformancePanel"),
      status: document.querySelector("#debtPerformanceStatus"),
      scopeWrap: document.querySelector("#debtPerformanceScopeWrap"),
      scope: document.querySelector("#debtPerformanceScope"),
      month: document.querySelector("#debtPerformanceMonth"),
      ranges: [...document.querySelectorAll("[data-debt-months]")],
      refresh: document.querySelector("#debtPerformanceRefresh"),
      latest: document.querySelector("#debtPerformanceLatest"),
      change: document.querySelector("#debtPerformanceChange"),
      paid: document.querySelector("#debtPerformancePaid"),
      balance: document.querySelector("#debtPerformanceBalance"),
      scopeLabel: document.querySelector("#debtPerformanceScopeLabel"),
      chart: document.querySelector("#debtPerformanceChart"),
      tableBody: document.querySelector("#debtPerformanceTableBody"),
    };
    let selectedMonths = 6;
    let requestId = 0;
    let contextKey = "";
    let lastPayload = null;
    let capturedFingerprint = "";

    if (!elements.panel) return { load: async () => {}, capture: async () => false, syncContext: () => {}, reset: () => {} };
    if (elements.month) {
      elements.month.max = currentWibMonth();
      if (!elements.month.value) elements.month.value = currentWibMonth();
    }
    elements.scope?.addEventListener("change", () => load());
    elements.month?.addEventListener("change", () => load());
    elements.refresh?.addEventListener("click", () => load({ force: true }));
    elements.ranges.forEach((button) => button.addEventListener("click", () => {
      selectedMonths = ALLOWED_RANGES.has(Number(button.dataset.debtMonths)) ? Number(button.dataset.debtMonths) : 6;
      elements.ranges.forEach((item) => item.classList.toggle("is-active", item === button));
      load();
    }));

    function stateContext() {
      const state = getState() || {};
      return {
        state,
        client: state.supabaseClient,
        user: state.user,
        profile: state.profile || {},
        isPetugas: state.profile?.role === "petugas",
        isAdmin: state.profile?.role === "admin",
      };
    }

    function populateOfficers(extra = []) {
      if (!elements.scope) return;
      const current = elements.scope.value;
      const names = [...new Set([...getOfficerNames(), ...extra]
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean))].sort((a, b) => a.localeCompare(b, "id-ID"));
      elements.scope.innerHTML = `<option value="">Keseluruhan</option>${names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
      if (current && names.includes(current)) elements.scope.value = current;
    }

    function syncContext() {
      const context = stateContext();
      const nextKey = `${context.user?.id || "guest"}:${context.profile?.role || "none"}:${context.profile?.petugas || ""}`;
      if (nextKey !== contextKey) {
        contextKey = nextKey;
        lastPayload = null;
        capturedFingerprint = "";
      }
      if (elements.scopeWrap) elements.scopeWrap.hidden = context.isPetugas;
      populateOfficers(lastPayload?.officers || []);
      if (context.isPetugas && elements.scope) elements.scope.value = String(context.profile?.petugas || "").toUpperCase();
      return context;
    }

    function setLoading() {
      elements.status.textContent = "Memuat riwayat performa...";
      elements.chart.innerHTML = '<div class="overview-history-empty">Memuat data...</div>';
      elements.tableBody.innerHTML = '<tr><td colspan="6">Memuat data...</td></tr>';
    }

    function render(payload) {
      lastPayload = payload;
      populateOfficers(payload.officers);
      const summary = buildHistorySummary(payload.rows);
      const context = stateContext();
      const scope = context.isPetugas ? String(context.profile?.petugas || payload.scope) : payload.scope;
      elements.scopeLabel.textContent = scope === "ALL" ? "Keseluruhan petugas" : scope;
      elements.latest.textContent = summary.latest ? formatPercent(summary.latest.persenTagihan) : "-";
      elements.paid.textContent = summary.available.length ? formatRupiah(summary.totalPaid) : "-";
      elements.balance.textContent = summary.latest ? formatRupiah(summary.latest.akhirRupiah) : "-";
      elements.change.classList.remove("is-positive", "is-negative");
      if (summary.change === null) {
        elements.change.textContent = "-";
      } else {
        elements.change.textContent = `${summary.change >= 0 ? "+" : ""}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(summary.change)} poin`;
        elements.change.classList.add(summary.change >= 0 ? "is-positive" : "is-negative");
      }
      elements.chart.innerHTML = buildHistoryChart(payload.rows);
      elements.tableBody.innerHTML = [...payload.rows].reverse().map((row) => row.available ? `
        <tr>
          <td>${escapeHtml(formatMonth(row.month, true))}</td>
          <td>${escapeHtml(formatRupiah(row.awalRupiah))}</td>
          <td>${escapeHtml(formatRupiah(row.akhirRupiah))}</td>
          <td>${escapeHtml(formatRupiah(row.pelunasanRupiah))}</td>
          <td>${escapeHtml(formatNumber(row.akhirId))}</td>
          <td>${escapeHtml(formatPercent(row.persenTagihan))}</td>
        </tr>` : `
        <tr class="is-missing"><td>${escapeHtml(formatMonth(row.month, true))}</td><td colspan="5">Belum ada snapshot</td></tr>`).join("");
      const count = summary.available.length;
      const latestUpdate = summary.latest?.capturedAt
        ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(summary.latest.capturedAt))
        : "";
      elements.status.textContent = count
        ? `${count} dari ${payload.rows.length} bulan memiliki data${latestUpdate ? ` · Diperbarui ${latestUpdate}` : ""}`
        : "Belum ada snapshot pada periode yang dipilih.";
    }

    async function load(options = {}) {
      const context = syncContext();
      if (!context.client || !context.user || (!context.isAdmin && !context.isPetugas)) {
        elements.status.textContent = "Login diperlukan untuk memuat riwayat performa.";
        elements.chart.innerHTML = '<div class="overview-history-empty">Riwayat belum tersedia.</div>';
        elements.tableBody.innerHTML = '<tr><td colspan="6">Riwayat belum tersedia.</td></tr>';
        return null;
      }
      const ownRequest = ++requestId;
      if (!options.silent) setLoading();
      const endMonth = /^\d{4}-\d{2}$/.test(elements.month?.value || "") ? elements.month.value : currentWibMonth();
      const selectedOfficer = context.isPetugas ? context.profile?.petugas || "" : elements.scope?.value || "";
      let data = null;
      let error = null;
      try {
        const response = await context.client.rpc("get_debt_performance_history", {
          p_end_month: `${endMonth}-01`,
          p_months: selectedMonths,
          p_petugas: selectedOfficer || null,
        });
        data = response.data;
        error = response.error;
      } catch (caughtError) {
        error = caughtError;
      }
      if (ownRequest !== requestId) return null;
      if (error) {
        const message = describeError(error);
        elements.status.textContent = message;
        elements.chart.innerHTML = `<div class="overview-history-empty">${escapeHtml(message)}</div>`;
        elements.tableBody.innerHTML = `<tr><td colspan="6">${escapeHtml(message)}</td></tr>`;
        return null;
      }
      const payload = normalizeHistoryPayload(data);
      render(payload);
      return payload;
    }

    async function capture(options = {}) {
      const context = syncContext();
      if (!context.client || !context.user || !context.isAdmin) return false;
      const rows = Array.isArray(context.state.report) ? context.state.report : [];
      if (!rows.length) return false;
      const month = monthFromTimestamp(context.state.uploadMeta?.akhir?.uploadedAt);
      const payloadRows = rows.map((row) => ({
        petugas: String(row.petugas || "").trim().toUpperCase(),
        awal_id: Math.max(0, Math.round(number(row.awalId))),
        awal_rupiah: Math.max(0, Math.round(number(row.awalRupiah))),
        akhir_id: Math.max(0, Math.round(number(row.akhirId))),
        akhir_rupiah: Math.max(0, Math.round(number(row.akhirRupiah))),
      })).filter((row) => row.petugas);
      if (!payloadRows.length) return false;
      const fingerprint = `${month}:${JSON.stringify(payloadRows)}`;
      if (!options.force && fingerprint === capturedFingerprint) return true;
      let error = null;
      try {
        const response = await context.client.rpc("save_debt_performance_snapshot", {
          p_month: `${month}-01`,
          p_rows: payloadRows,
        });
        error = response.error;
      } catch (caughtError) {
        error = caughtError;
      }
      if (error) {
        if (!options.silent) elements.status.textContent = describeError(error);
        return false;
      }
      capturedFingerprint = fingerprint;
      if (options.reload !== false) await load({ silent: true });
      return true;
    }

    function reset() {
      requestId += 1;
      contextKey = "";
      lastPayload = null;
      capturedFingerprint = "";
      if (elements.scope) elements.scope.value = "";
      if (elements.month) elements.month.value = currentWibMonth();
      elements.latest.textContent = "-";
      elements.change.textContent = "-";
      elements.paid.textContent = "-";
      elements.balance.textContent = "-";
      elements.status.textContent = "Login diperlukan untuk memuat riwayat performa.";
      elements.chart.innerHTML = '<div class="overview-history-empty">Riwayat belum tersedia.</div>';
      elements.tableBody.innerHTML = '<tr><td colspan="6">Riwayat belum tersedia.</td></tr>';
    }

    syncContext();
    return { load, capture, syncContext, reset };
  }

  return {
    create,
    normalizeHistoryPayload,
    buildHistorySummary,
    buildHistoryChart,
    currentWibMonth,
    monthFromTimestamp,
    formatMonth,
  };
});
