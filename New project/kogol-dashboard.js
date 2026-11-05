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
    return `<svg class="kogol-donut" viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(`${summary.label}: ${rate} lunas`)}">
      <circle class="kogol-donut-track" cx="60" cy="60" r="42"></circle>
      <circle class="kogol-donut-paid" cx="60" cy="60" r="42" pathLength="${circumference}" stroke="${summary.color}" stroke-dasharray="${paidDash} ${remainingDash}" transform="rotate(-90 60 60)"></circle>
      <text x="60" y="56" text-anchor="middle" class="kogol-donut-rate">${escapeHtml(rate)}</text>
      <text x="60" y="71" text-anchor="middle" class="kogol-donut-caption">lunas</text>
    </svg>`;
  }

  function buildCards(summaries) {
    return summaries.map((summary) => `
      <article class="kogol-card" data-kogol-key="${summary.key}">
        <div class="kogol-card-head">
          <div><span class="kogol-eyebrow">${escapeHtml(summary.label)}</span><h3>${escapeHtml(summary.label)}</h3></div>
          <span class="kogol-snapshot-count">${summary.available ? `${summary.snapshotCount} snapshot` : "Belum upload"}</span>
        </div>
        <div class="kogol-card-body">
          ${buildDonut(summary)}
          <div class="kogol-legend">
            <div><i class="is-paid" style="--kogol-color:${summary.color}"></i><span>Lunas</span><strong>${summary.rate === null ? "-" : formatNumber(summary.paidId)} IDPEL</strong><small>${summary.rate === null ? "-" : formatRupiah(summary.paidRupiah)}</small></div>
            <div><i class="is-unpaid"></i><span>Belum lunas</span><strong>${formatNumber(summary.unpaidId)} IDPEL</strong><small>${formatRupiah(summary.unpaidRupiah)}</small></div>
          </div>
        </div>
        <footer>${summary.available
          ? (!summary.opening ? "Saldo awal belum diunggah. Data akhir belum dapat dihitung sebagai realisasi."
            : summary.snapshotCount < 2 ? "Saldo awal tersedia; menunggu upload saldo akhir."
              : `Saldo awal ${formatDate(summary.opening?.snapshotDate)} - data terakhir ${formatDate(summary.closing?.snapshotDate)}`)
          : "Upload saldo awal dan saldo terbaru untuk melihat pencapaian."}</footer>
      </article>
    `).join("");
  }

  function describeError(error) {
    const message = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" ");
    if (/monitoring_kogol_debt_snapshots|save_kogol_debt_snapshot|schema cache|PGRST20/i.test(message)) {
      return "Database dashboard Kogol belum diaktifkan.";
    }
    return message || "Data Kogol tidak dapat dimuat.";
  }

  function create(options = {}) {
    const getState = options.getState || (() => ({}));
    const onMonthChange = options.onMonthChange || (() => {});
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

    function syncContext() {
      const state = getState();
      const nextKey = `${state?.user?.id || ""}:${state?.profile?.role || ""}`;
      if (contextKey !== nextKey) {
        contextKey = nextKey;
        records = [];
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
        ? `${available} dari 4 kelompok memiliki snapshot pada ${formatMonth(month)}.`
        : `Belum ada snapshot Kogol pada ${formatMonth(month)}.`;
    }

    async function load(options = {}) {
      const context = syncContext();
      const month = validMonth(elements.month.value);
      if (!context.client || !context.user || !context.isAdmin) {
        records = [];
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
        elements.cards.innerHTML = `<div class="kogol-dashboard-empty">${escapeHtml(describeError(result.error))}</div>`;
        elements.status.textContent = describeError(result.error);
        return null;
      }
      records = normalizeRows(result?.data || []);
      render();
      return records;
    }

    async function saveSnapshots(date, snapshots, sourceFile) {
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
      let result;
      try {
        result = await context.client.rpc("save_kogol_debt_snapshot", {
          p_snapshot_date: snapshotDate,
          p_source_file: cleanFile,
          p_rows: rows,
        });
      } catch (error) {
        result = { error };
      }
      if (result?.error) {
        elements.status.textContent = describeError(result.error);
        return false;
      }
      if (snapshotDate.startsWith(`${validMonth(elements.month.value)}-`)) await load({ silent: true, force: true });
      return true;
    }

    function setMonth(month) {
      const normalized = validMonth(month);
      elements.month.value = normalized;
      load({ silent: true });
    }

    function reset() {
      requestId += 1;
      contextKey = "";
      records = [];
      elements.month.value = wibMonth();
      elements.cards.innerHTML = '<div class="kogol-dashboard-empty">Dashboard belum tersedia.</div>';
      elements.status.textContent = "Login admin untuk memuat dashboard Kogol.";
    }

    syncContext();
    render();
    return { load, saveSnapshots, setMonth, syncContext, reset };
  }

  return { GROUPS, normalizeRows, buildSummary, buildDonut, create, wibMonth, validMonth, formatMonth };
});
