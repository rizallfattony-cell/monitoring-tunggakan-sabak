(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SimontokDebtPerformance = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const DAILY_TABLE = "monitoring_debt_performance_daily";
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

  function wibDateParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  }

  function currentWibMonth(now = new Date()) {
    const parts = wibDateParts(now);
    return `${parts.year}-${parts.month}`;
  }

  function shiftMonth(value, delta) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
    const base = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : new Date();
    base.setUTCMonth(base.getUTCMonth() + Number(delta || 0));
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function daysInMonth(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
    if (!match) return 31;
    return new Date(Number(match[1]), Number(match[2]), 0).getDate();
  }

  function monthBounds(value) {
    const month = /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : currentWibMonth();
    return {
      month,
      start: `${month}-01`,
      end: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
    };
  }

  function formatMonth(value, long = true) {
    const month = String(value || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return "-";
    const date = new Date(`${month}-01T00:00:00+07:00`);
    return new Intl.DateTimeFormat("id-ID", {
      month: long ? "long" : "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(date);
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

  function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(number(value));
  }

  function formatCompactRupiah(value) {
    return `Rp${new Intl.NumberFormat("id-ID", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(number(value))}`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(value))}%`;
  }

  function normalizeDailyRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      snapshotDate: String(row?.snapshot_date || row?.snapshotDate || "").slice(0, 10),
      petugas: String(row?.petugas || "").trim().toUpperCase(),
      saldoId: Math.max(0, Math.round(number(row?.saldo_id ?? row?.saldoId))),
      saldoRupiah: Math.max(0, Math.round(number(row?.saldo_rupiah ?? row?.saldoRupiah))),
      sourceFile: String(row?.source_file || row?.sourceFile || ""),
      uploadedAt: row?.uploaded_at || row?.uploadedAt || null,
    })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.snapshotDate) && row.petugas);
  }

  function buildMonthSeries(rows, month, scope = "ALL") {
    const normalizedMonth = /^\d{4}-\d{2}$/.test(String(month || "")) ? String(month) : currentWibMonth();
    const normalizedScope = String(scope || "ALL").trim().toUpperCase() || "ALL";
    const grouped = new Map();
    normalizeDailyRows(rows).forEach((row) => {
      if (!row.snapshotDate.startsWith(`${normalizedMonth}-`)) return;
      if (normalizedScope !== "ALL" && row.petugas !== normalizedScope) return;
      const item = grouped.get(row.snapshotDate) || {
        saldoId: 0,
        saldoRupiah: 0,
        officers: new Set(),
        uploadedAt: null,
      };
      item.saldoId += row.saldoId;
      item.saldoRupiah += row.saldoRupiah;
      item.officers.add(row.petugas);
      if (!item.uploadedAt || String(row.uploadedAt || "") > String(item.uploadedAt || "")) item.uploadedAt = row.uploadedAt;
      grouped.set(row.snapshotDate, item);
    });

    const daily = Array.from({ length: daysInMonth(normalizedMonth) }, (_, index) => {
      const date = `${normalizedMonth}-${String(index + 1).padStart(2, "0")}`;
      const value = grouped.get(date);
      return value ? {
        day: index + 1,
        date,
        available: true,
        saldoId: value.saldoId,
        saldoRupiah: value.saldoRupiah,
        officerCount: value.officers.size,
        uploadedAt: value.uploadedAt,
      } : {
        day: index + 1,
        date,
        available: false,
        saldoId: null,
        saldoRupiah: null,
        officerCount: 0,
        uploadedAt: null,
      };
    });
    const available = daily.filter((row) => row.available);
    const opening = available[0] || null;
    const closing = available[available.length - 1] || null;
    const reductionId = opening && closing ? opening.saldoId - closing.saldoId : null;
    const reductionRupiah = opening && closing ? opening.saldoRupiah - closing.saldoRupiah : null;
    const rate = opening && opening.saldoRupiah > 0
      ? (reductionRupiah * 100) / opening.saldoRupiah
      : null;
    return {
      month: normalizedMonth,
      scope: normalizedScope,
      daily,
      available,
      opening,
      closing,
      reductionId,
      reductionRupiah,
      rate,
    };
  }

  function buildLeaderboard(rows, month, officerNames = []) {
    const declaredNames = [...new Set(officerNames
      .map((name) => String(name || "").trim().toUpperCase())
      .filter(Boolean))];
    const declaredSet = new Set(declaredNames);
    const normalized = normalizeDailyRows(rows)
      .filter((row) => !declaredSet.size || declaredSet.has(row.petugas));
    const names = declaredNames.length ? declaredNames : [...new Set(normalized.map((row) => row.petugas))];
    return names.map((petugas) => {
      const series = buildMonthSeries(normalized, month, petugas);
      return {
        petugas,
        available: series.available.length > 0,
        openingId: series.opening?.saldoId ?? null,
        openingRupiah: series.opening?.saldoRupiah ?? null,
        closingId: series.closing?.saldoId ?? null,
        closingRupiah: series.closing?.saldoRupiah ?? null,
        reductionId: series.reductionId,
        reductionRupiah: series.reductionRupiah,
        rate: series.rate,
        openingDate: series.opening?.date || null,
        closingDate: series.closing?.date || null,
      };
    }).sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const rateDiff = number(b.rate ?? -Infinity) - number(a.rate ?? -Infinity);
      if (rateDiff) return rateDiff;
      const reductionDiff = number(b.reductionRupiah) - number(a.reductionRupiah);
      return reductionDiff || a.petugas.localeCompare(b.petugas, "id-ID");
    });
  }

  function performanceStatus(rate, available) {
    if (!available || rate === null) return { label: "Belum ada data", className: "is-warning" };
    if (rate >= 80) return { label: "Sangat baik", className: "" };
    if (rate >= 60) return { label: "Baik", className: "is-warning" };
    return { label: "Prioritas", className: "is-danger" };
  }

  function buildDailyChart(primary, comparison) {
    const values = [...(primary?.available || []), ...(comparison?.available || [])]
      .map((row) => number(row.saldoRupiah));
    if (!values.length) return '<div class="performance-empty">Belum ada upload saldo harian pada bulan yang dipilih.</div>';

    const width = 1000;
    const height = 340;
    const margin = { top: 24, right: 24, bottom: 45, left: 82 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const maximumValue = Math.max(...values, 1);
    const magnitude = 10 ** Math.floor(Math.log10(maximumValue));
    const step = Math.max(1, magnitude / (maximumValue / magnitude < 2 ? 2 : 1));
    const maximum = Math.ceil(maximumValue / step) * step;
    const uploadedDays = [...new Set([
      ...(primary?.available || []),
      ...(comparison?.available || []),
    ].map((row) => row.day))].sort((a, b) => a - b);
    const x = (day) => {
      const index = Math.max(0, uploadedDays.indexOf(day));
      return uploadedDays.length === 1
        ? margin.left + innerWidth / 2
        : margin.left + (innerWidth * index) / (uploadedDays.length - 1);
    };
    const y = (value) => margin.top + innerHeight - (Math.max(0, number(value)) / maximum) * innerHeight;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maximum * ratio);
    const grid = ticks.map((tick) => {
      const py = y(tick);
      return `<line x1="${margin.left}" y1="${py}" x2="${width - margin.right}" y2="${py}" stroke="#dfe7ec" stroke-width="1" />
        <text x="${margin.left - 12}" y="${py + 4}" fill="#748693" font-size="10" text-anchor="end">${escapeHtml(formatCompactRupiah(tick))}</text>`;
    }).join("");

    function seriesSvg(series, color) {
      const linePoints = (series?.daily || [])
        .filter((row) => row.available)
        .map((row) => `${x(row.day)},${y(row.saldoRupiah)}`);
      const lines = linePoints.length > 1
        ? `<polyline points="${linePoints.join(" ")}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
        : "";
      const points = (series?.daily || []).map((row) => row.available
        ? `<circle cx="${x(row.day)}" cy="${y(row.saldoRupiah)}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"><title>${escapeHtml(`${formatDate(row.date)}: ${formatRupiah(row.saldoRupiah)}`)}</title></circle>`
        : "").join("");
      return `${lines}${points}`;
    }

    const dayLabels = uploadedDays.map((day) => `<text x="${x(day)}" y="${height - 16}" fill="#607481" font-size="10" text-anchor="middle">${day}</text>`).join("");
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${grid}
      <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="#aebdc6" stroke-width="1" />
      ${seriesSvg(comparison, "#d99100")}${seriesSvg(primary, "#087e8b")}${dayLabels}
      <text x="${width / 2}" y="${height - 1}" fill="#7a8d99" font-size="10" text-anchor="middle">Tanggal upload</text>
    </svg>`;
  }

  function normalizeHistoryPayload(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    return {
      scope: String(source.scope || "ALL"),
      rows: (Array.isArray(source.rows) ? source.rows : []).map((row) => ({
        month: String(row?.month || "").slice(0, 10),
        available: Boolean(row?.available),
        awalRupiah: nullableNumber(row?.awal_rupiah),
        akhirRupiah: nullableNumber(row?.akhir_rupiah),
        akhirId: nullableNumber(row?.akhir_id),
        pelunasanRupiah: nullableNumber(row?.pelunasan_rupiah),
        persenTagihan: nullableNumber(row?.persen_tagihan),
      })),
    };
  }

  function buildMonthlyHistoryChart(rows) {
    const normalized = Array.isArray(rows) ? rows : [];
    const availableValues = normalized.filter((row) => row.available && row.persenTagihan !== null).map((row) => number(row.persenTagihan));
    if (!availableValues.length) return '<div class="performance-empty">Riwayat bulanan belum tersedia.</div>';
    const width = 1000;
    const height = 250;
    const margin = { top: 24, right: 24, bottom: 44, left: 52 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const maximum = Math.max(100, Math.ceil(Math.max(...availableValues) / 10) * 10);
    const x = (index) => normalized.length === 1 ? width / 2 : margin.left + (innerWidth * index) / Math.max(1, normalized.length - 1);
    const y = (value) => margin.top + innerHeight - (Math.max(0, number(value)) / maximum) * innerHeight;
    const grid = [0, 25, 50, 75, 100].map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" stroke="#e1e8ec" stroke-width="1" /><text x="${margin.left - 9}" y="${y(tick) + 4}" fill="#748693" font-size="10" text-anchor="end">${tick}%</text>`).join("");
    const segments = [];
    let current = [];
    normalized.forEach((row, index) => {
      if (row.available && row.persenTagihan !== null) current.push(`${x(index)},${y(row.persenTagihan)}`);
      else if (current.length) { segments.push(current); current = []; }
    });
    if (current.length) segments.push(current);
    const lines = segments.map((points) => points.length > 1 ? `<polyline points="${points.join(" ")}" fill="none" stroke="#173f62" stroke-width="3" stroke-linejoin="round" />` : "").join("");
    const points = normalized.map((row, index) => row.available && row.persenTagihan !== null
      ? `<circle cx="${x(index)}" cy="${y(row.persenTagihan)}" r="4" fill="#fff" stroke="#173f62" stroke-width="2"><title>${escapeHtml(`${formatMonth(row.month)}: ${formatPercent(row.persenTagihan)}`)}</title></circle><text x="${x(index)}" y="${y(row.persenTagihan) - 10}" fill="#173f62" font-size="10" font-weight="700" text-anchor="middle">${escapeHtml(formatPercent(row.persenTagihan))}</text>`
      : "").join("");
    const labels = normalized.map((row, index) => `<text x="${x(index)}" y="${height - 15}" fill="#607481" font-size="10" text-anchor="middle">${escapeHtml(formatMonth(row.month, false))}</text>`).join("");
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${lines}${points}${labels}</svg>`;
  }

  function describeError(error) {
    const message = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" ");
    if (/monitoring_debt_performance_daily|save_debt_performance_daily_snapshot|schema cache|PGRST20/i.test(message)) {
      return "Database saldo harian performa belum diaktifkan.";
    }
    return message || "Data performa tidak dapat dimuat.";
  }

  function create(options = {}) {
    const getState = options.getState || (() => ({}));
    const getOfficerNames = options.getOfficerNames || (() => []);
    const elements = {
      panel: document.querySelector("#debtPerformancePanel"),
      status: document.querySelector("#debtPerformanceStatus"),
      viewButtons: [...document.querySelectorAll("[data-performance-view]")],
      primaryMonth: document.querySelector("#debtPerformancePrimaryMonth"),
      compareMonth: document.querySelector("#debtPerformanceCompareMonth"),
      scopeWrap: document.querySelector("#debtPerformanceScopeWrap"),
      scope: document.querySelector("#debtPerformanceScope"),
      refresh: document.querySelector("#debtPerformanceRefresh"),
      opening: document.querySelector("#debtPerformanceOpening"),
      openingNote: document.querySelector("#debtPerformanceOpeningNote"),
      closing: document.querySelector("#debtPerformanceClosing"),
      closingNote: document.querySelector("#debtPerformanceClosingNote"),
      reduction: document.querySelector("#debtPerformanceReduction"),
      reductionNote: document.querySelector("#debtPerformanceReductionNote"),
      rate: document.querySelector("#debtPerformanceRate"),
      rateNote: document.querySelector("#debtPerformanceRateNote"),
      chartTitle: document.querySelector("#debtPerformanceChartTitle"),
      scopeLabel: document.querySelector("#debtPerformanceScopeLabel"),
      primaryLegend: document.querySelector("#debtPerformancePrimaryLegend"),
      compareLegend: document.querySelector("#debtPerformanceCompareLegend"),
      chart: document.querySelector("#debtPerformanceChart"),
      leaderboard: document.querySelector("#debtPerformanceLeaderboard"),
      leaderboardMonth: document.querySelector("#debtPerformanceLeaderboardMonth"),
      leaderboardBody: document.querySelector("#debtPerformanceLeaderboardBody"),
      search: document.querySelector("#debtPerformanceSearch"),
      officerComparison: document.querySelector("#debtPerformanceOfficerComparison"),
      officerBody: document.querySelector("#debtPerformanceOfficerBody"),
      ranges: [...document.querySelectorAll("[data-debt-months]")],
      historyChart: document.querySelector("#debtPerformanceHistoryChart"),
      historyBody: document.querySelector("#debtPerformanceHistoryBody"),
    };
    let selectedView = "unit";
    let selectedMonths = 6;
    let requestId = 0;
    let contextKey = "";
    let officerNames = [];
    let lastLeaderboard = [];

    if (!elements.panel) {
      return {
        load: async () => null,
        saveSnapshot: async () => false,
        deleteSnapshot: async () => false,
        capture: async () => false,
        syncContext: () => {},
        reset: () => {},
      };
    }

    const currentMonth = currentWibMonth();
    if (elements.primaryMonth) {
      elements.primaryMonth.max = currentMonth;
      elements.primaryMonth.value = currentMonth;
    }
    if (elements.compareMonth) {
      elements.compareMonth.max = currentMonth;
      elements.compareMonth.value = shiftMonth(currentMonth, -1);
    }

    elements.viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.performanceView)));
    elements.primaryMonth?.addEventListener("change", () => load());
    elements.compareMonth?.addEventListener("change", () => load());
    elements.scope?.addEventListener("change", () => load());
    elements.refresh?.addEventListener("click", () => load({ force: true }));
    elements.search?.addEventListener("input", () => renderLeaderboard(lastLeaderboard));
    elements.leaderboardBody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-performance-officer]");
      if (!button || !elements.scope) return;
      elements.scope.value = button.dataset.performanceOfficer;
      setView("officer");
    });
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
        isAdmin: state.profile?.role === "admin",
        isPetugas: state.profile?.role === "petugas",
      };
    }

    function populateOfficers(extra = []) {
      if (!elements.scope) return;
      const current = elements.scope.value;
      officerNames = [...new Set([
        ...getOfficerNames(),
        ...extra,
      ].map((name) => String(name || "").trim().toUpperCase()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "id-ID"));
      elements.scope.innerHTML = officerNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
      if (current && officerNames.includes(current)) elements.scope.value = current;
      else if (officerNames.length) elements.scope.value = officerNames[0];
    }

    function setView(view, options = {}) {
      const context = stateContext();
      selectedView = context.isPetugas ? "officer" : (view === "officer" ? "officer" : "unit");
      elements.viewButtons.forEach((button) => {
        const active = button.dataset.performanceView === selectedView;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (elements.scopeWrap) elements.scopeWrap.hidden = selectedView !== "officer" || context.isPetugas;
      if (elements.leaderboard) elements.leaderboard.hidden = selectedView !== "unit";
      if (elements.officerComparison) elements.officerComparison.hidden = selectedView !== "officer";
      if (options.load !== false) load();
    }

    function syncContext() {
      const context = stateContext();
      const nextKey = `${context.user?.id || "guest"}:${context.profile?.role || "none"}:${context.profile?.petugas || ""}`;
      if (nextKey !== contextKey) {
        contextKey = nextKey;
        requestId += 1;
      }
      populateOfficers();
      const unitButton = elements.viewButtons.find((button) => button.dataset.performanceView === "unit");
      if (unitButton) unitButton.hidden = context.isPetugas;
      if (context.isPetugas && elements.scope) {
        const own = String(context.profile?.petugas || "").trim().toUpperCase();
        if (own) {
          populateOfficers([own]);
          elements.scope.value = own;
        }
      }
      setView(context.isPetugas ? "officer" : selectedView, { load: false });
      return context;
    }

    function selectedScope(context) {
      if (context.isPetugas) return String(context.profile?.petugas || "").trim().toUpperCase();
      return selectedView === "unit" ? "ALL" : String(elements.scope?.value || officerNames[0] || "").trim().toUpperCase();
    }

    async function loadMonthRows(client, month) {
      const bounds = monthBounds(month);
      return client
        .from(DAILY_TABLE)
        .select("snapshot_date,petugas,saldo_id,saldo_rupiah,source_file,uploaded_at")
        .gte("snapshot_date", bounds.start)
        .lte("snapshot_date", bounds.end)
        .order("snapshot_date", { ascending: true });
    }

    function setLoading() {
      elements.status.textContent = "Memuat saldo harian performa...";
      elements.chart.innerHTML = '<div class="performance-empty">Memuat grafik...</div>';
      elements.historyChart.innerHTML = '<div class="performance-empty">Memuat riwayat...</div>';
    }

    function renderMetrics(series) {
      const available = series.available.length > 0;
      elements.opening.textContent = available ? formatRupiah(series.opening.saldoRupiah) : "-";
      elements.openingNote.textContent = available
        ? `${formatNumber(series.opening.saldoId)} IDPEL pada ${formatDate(series.opening.date)}`
        : "Belum ada data";
      elements.closing.textContent = available ? formatRupiah(series.closing.saldoRupiah) : "-";
      elements.closingNote.textContent = available
        ? `${formatNumber(series.closing.saldoId)} IDPEL pada ${formatDate(series.closing.date)}`
        : "Belum ada data";
      elements.reduction.textContent = available ? formatRupiah(series.reductionRupiah) : "-";
      elements.reductionNote.textContent = available
        ? `${formatNumber(series.reductionId)} IDPEL berkurang`
        : "Belum ada data";
      elements.rate.textContent = available ? formatPercent(series.rate) : "-";
      elements.rateNote.textContent = available
        ? `${series.available.length} tanggal sudah diunggah`
        : "Berdasarkan rupiah tunggakan";
    }

    function renderLeaderboard(rows) {
      if (!elements.leaderboardBody) return;
      const keyword = String(elements.search?.value || "").trim().toUpperCase();
      const filtered = rows.filter((row) => !keyword || row.petugas.includes(keyword));
      if (!filtered.length) {
        elements.leaderboardBody.innerHTML = '<tr><td colspan="8">Petugas tidak ditemukan.</td></tr>';
        return;
      }
      elements.leaderboardBody.innerHTML = filtered.map((row) => {
        const rank = rows.indexOf(row) + 1;
        const status = performanceStatus(row.rate, row.available);
        const progressClass = row.rate === null || row.rate < 60 ? "is-danger" : row.rate < 80 ? "is-warning" : "";
        const width = Math.max(0, Math.min(100, number(row.rate)));
        return `<tr>
          <td><span class="performance-rank">${rank}</span></td>
          <td><span class="performance-officer-name">${escapeHtml(row.petugas)}<small>${row.available ? `${formatNumber(row.closingId)} IDPEL tersisa` : "Belum upload"}</small></span></td>
          <td>${row.available ? escapeHtml(formatRupiah(row.openingRupiah)) : "-"}</td>
          <td>${row.available ? escapeHtml(formatRupiah(row.closingRupiah)) : "-"}</td>
          <td>${row.available ? escapeHtml(formatRupiah(row.reductionRupiah)) : "-"}</td>
          <td><span class="performance-progress ${progressClass}"><span class="performance-progress-track"><i style="width:${width}%"></i></span><b>${escapeHtml(formatPercent(row.rate))}</b></span></td>
          <td><span class="performance-badge ${status.className}">${escapeHtml(status.label)}</span></td>
          <td><button class="performance-detail-button" type="button" data-performance-officer="${escapeHtml(row.petugas)}" aria-label="Lihat ${escapeHtml(row.petugas)}" title="Lihat detail"><i data-lucide="chevron-right" aria-hidden="true"></i></button></td>
        </tr>`;
      }).join("");
      if (typeof window !== "undefined") window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
    }

    function renderOfficerComparison(primary, comparison) {
      if (!elements.officerBody) return;
      elements.officerBody.innerHTML = [primary, comparison].map((series) => series.available.length ? `<tr>
        <td>${escapeHtml(formatMonth(series.month))}</td>
        <td>${escapeHtml(formatDate(series.opening.date))}</td>
        <td>${escapeHtml(formatDate(series.closing.date))}</td>
        <td>${escapeHtml(formatRupiah(series.opening.saldoRupiah))}</td>
        <td>${escapeHtml(formatRupiah(series.closing.saldoRupiah))}</td>
        <td>${escapeHtml(formatRupiah(series.reductionRupiah))}</td>
        <td>${escapeHtml(formatPercent(series.rate))}</td>
      </tr>` : `<tr class="is-missing"><td>${escapeHtml(formatMonth(series.month))}</td><td colspan="6">Belum ada upload saldo harian</td></tr>`).join("");
    }

    function renderHistory(payload) {
      const history = normalizeHistoryPayload(payload);
      elements.historyChart.innerHTML = buildMonthlyHistoryChart(history.rows);
      elements.historyBody.innerHTML = history.rows.length ? [...history.rows].reverse().map((row) => row.available ? `<tr>
        <td>${escapeHtml(formatMonth(row.month))}</td>
        <td>${escapeHtml(formatRupiah(row.awalRupiah))}</td>
        <td>${escapeHtml(formatRupiah(row.akhirRupiah))}</td>
        <td>${escapeHtml(formatRupiah(row.pelunasanRupiah))}</td>
        <td>${escapeHtml(formatNumber(row.akhirId))}</td>
        <td>${escapeHtml(formatPercent(row.persenTagihan))}</td>
      </tr>` : `<tr class="is-missing"><td>${escapeHtml(formatMonth(row.month))}</td><td colspan="5">Belum ada snapshot</td></tr>`).join("")
        : '<tr><td colspan="6">Riwayat bulanan belum tersedia.</td></tr>';
    }

    async function load(options = {}) {
      const context = syncContext();
      if (!context.client || !context.user || (!context.isAdmin && !context.isPetugas)) {
        elements.status.textContent = "Login diperlukan untuk memuat dashboard performa.";
        elements.chart.innerHTML = '<div class="performance-empty">Dashboard belum tersedia.</div>';
        elements.historyChart.innerHTML = '<div class="performance-empty">Riwayat belum tersedia.</div>';
        return null;
      }
      const ownRequest = ++requestId;
      if (!options.silent) setLoading();
      const primaryMonth = /^\d{4}-\d{2}$/.test(elements.primaryMonth?.value || "") ? elements.primaryMonth.value : currentWibMonth();
      const compareMonth = /^\d{4}-\d{2}$/.test(elements.compareMonth?.value || "") ? elements.compareMonth.value : shiftMonth(primaryMonth, -1);
      const scope = selectedScope(context);
      let primaryResponse;
      let compareResponse;
      let historyResponse;
      try {
        [primaryResponse, compareResponse, historyResponse] = await Promise.all([
          loadMonthRows(context.client, primaryMonth),
          loadMonthRows(context.client, compareMonth),
          context.client.rpc("get_debt_performance_history", {
            p_end_month: `${primaryMonth}-01`,
            p_months: selectedMonths,
            p_petugas: scope === "ALL" ? null : scope,
          }),
        ]);
      } catch (error) {
        primaryResponse = { data: null, error };
      }
      if (ownRequest !== requestId) return null;
      const error = primaryResponse?.error || compareResponse?.error;
      if (error) {
        const message = describeError(error);
        elements.status.textContent = message;
        elements.chart.innerHTML = `<div class="performance-empty">${escapeHtml(message)}</div>`;
        return null;
      }
      populateOfficers();
      const allowedOfficers = new Set(officerNames);
      const primaryRows = normalizeDailyRows(primaryResponse?.data)
        .filter((row) => !allowedOfficers.size || allowedOfficers.has(row.petugas));
      const compareRows = normalizeDailyRows(compareResponse?.data)
        .filter((row) => !allowedOfficers.size || allowedOfficers.has(row.petugas));
      const effectiveScope = selectedScope(context);
      const primary = buildMonthSeries(primaryRows, primaryMonth, effectiveScope);
      const comparison = buildMonthSeries(compareRows, compareMonth, effectiveScope);
      renderMetrics(primary);
      elements.primaryLegend.textContent = formatMonth(primaryMonth);
      elements.compareLegend.textContent = formatMonth(compareMonth);
      elements.chartTitle.textContent = selectedView === "unit" ? "Tren Saldo Harian Unit" : `Tren Saldo Harian ${effectiveScope}`;
      elements.scopeLabel.textContent = selectedView === "unit"
        ? "Akumulasi saldo harian seluruh petugas."
        : `Perbandingan saldo harian ${effectiveScope}.`;
      elements.chart.innerHTML = buildDailyChart(primary, comparison);
      elements.leaderboardMonth.textContent = formatMonth(primaryMonth);
      lastLeaderboard = buildLeaderboard(primaryRows, primaryMonth, officerNames);
      renderLeaderboard(lastLeaderboard);
      renderOfficerComparison(primary, comparison);
      if (historyResponse?.error) {
        elements.historyChart.innerHTML = `<div class="performance-empty">${escapeHtml(describeError(historyResponse.error))}</div>`;
        elements.historyBody.innerHTML = '<tr><td colspan="6">Riwayat bulanan belum tersedia.</td></tr>';
      } else {
        renderHistory(historyResponse?.data);
      }
      const primaryCount = primary.available.length;
      const compareCount = comparison.available.length;
      elements.status.textContent = primaryCount || compareCount
        ? `${formatMonth(primaryMonth)}: ${primaryCount} tanggal; ${formatMonth(compareMonth)}: ${compareCount} tanggal.`
        : "Belum ada saldo harian pada dua bulan yang dipilih.";
      return { primary, comparison, leaderboard: lastLeaderboard };
    }

    async function saveSnapshot(date, snapshot, sourceFile = "") {
      const context = syncContext();
      if (!context.client || !context.user || !context.isAdmin) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return false;
      const snapshotRows = snapshot?.petugas && typeof snapshot.petugas === "object" ? snapshot.petugas : {};
      const configuredNames = [...new Set(getOfficerNames()
        .map((name) => String(name || "").trim().toUpperCase())
        .filter(Boolean))];
      const names = configuredNames.length
        ? configuredNames
        : [...new Set(Object.keys(snapshotRows).map((name) => String(name || "").trim().toUpperCase()).filter(Boolean))];
      if (!names.length) return false;
      const rows = names.map((petugas) => ({
        petugas,
        saldo_id: Math.max(0, Math.round(number(snapshotRows[petugas]?.akhirId))),
        saldo_rupiah: Math.max(0, Math.round(number(snapshotRows[petugas]?.akhirRupiah))),
      }));
      const cleanFile = String(sourceFile || "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
      let response;
      try {
        response = await context.client.rpc("save_debt_performance_daily_snapshot", {
          p_snapshot_date: date,
          p_source_file: cleanFile,
          p_rows: rows,
        });
      } catch (error) {
        response = { error };
      }
      if (response?.error) {
        elements.status.textContent = describeError(response.error);
        return false;
      }
      if (elements.primaryMonth && date.slice(0, 7) === elements.primaryMonth.value) await load({ silent: true });
      return true;
    }

    async function deleteSnapshot(date) {
      const context = syncContext();
      if (!context.client || !context.user || !context.isAdmin) return false;
      let response;
      try {
        response = await context.client.rpc("delete_debt_performance_daily_snapshot", { p_snapshot_date: date });
      } catch (error) {
        response = { error };
      }
      if (response?.error) {
        elements.status.textContent = describeError(response.error);
        return false;
      }
      await load({ silent: true });
      return true;
    }

    function reset() {
      requestId += 1;
      contextKey = "";
      selectedView = "unit";
      selectedMonths = 6;
      lastLeaderboard = [];
      if (elements.primaryMonth) elements.primaryMonth.value = currentWibMonth();
      if (elements.compareMonth) elements.compareMonth.value = shiftMonth(currentWibMonth(), -1);
      elements.status.textContent = "Login diperlukan untuk memuat dashboard performa.";
      elements.chart.innerHTML = '<div class="performance-empty">Dashboard belum tersedia.</div>';
      elements.historyChart.innerHTML = '<div class="performance-empty">Riwayat belum tersedia.</div>';
      setView("unit", { load: false });
    }

    syncContext();
    return {
      load,
      saveSnapshot,
      deleteSnapshot,
      capture: async () => false,
      syncContext,
      reset,
    };
  }

  return {
    create,
    normalizeDailyRows,
    buildMonthSeries,
    buildLeaderboard,
    buildDailyChart,
    normalizeHistoryPayload,
    buildMonthlyHistoryChart,
    currentWibMonth,
    shiftMonth,
    formatMonth,
  };
});
