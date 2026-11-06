(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SimontokKogol0Detail = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const PAGE_SIZE = 100;

  function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency", currency: "IDR", maximumFractionDigits: 0,
    }).format(number(value));
  }

  function wibDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  }

  function sortCustomers(rows) {
    return [...rows].sort((a, b) => number(b.rptag) - number(a.rptag)
      || String(a.idpel || "").localeCompare(String(b.idpel || ""), "id-ID", { numeric: true }));
  }

  function buildOfficers(rows, names) {
    const grouped = new Map((names || []).map((name) => [name, { name, rows: [], amount: 0 }]));
    for (const row of rows) {
      const name = String(row.petugas || "PETUGAS KOSONG").trim();
      if (!grouped.has(name)) grouped.set(name, { name, rows: [], amount: 0 });
      const officer = grouped.get(name);
      officer.rows.push(row);
      officer.amount += number(row.rptag);
    }
    return [...grouped.values()].map((officer) => ({
      ...officer, rows: sortCustomers(officer.rows), count: officer.rows.length,
    })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "id-ID"));
  }

  function matchesSnapshot(rows, summary) {
    if (!summary?.closing) return false;
    const amount = rows.reduce((total, row) => total + number(row.rptag), 0);
    return rows.length === number(summary.unpaidId) && Math.round(amount) === Math.round(number(summary.unpaidRupiah));
  }

  function create(options = {}) {
    const getState = options.getState || (() => ({}));
    const getOfficerNames = options.getOfficerNames || (() => []);
    const elements = {
      panel: document.querySelector("#kogol0DetailPanel"),
      status: document.querySelector("#kogol0DetailStatus"),
      heading: document.querySelector("#kogol0DetailHeading"),
      back: document.querySelector("#kogol0DetailBack"),
      search: document.querySelector("#kogol0DetailSearch"),
      summary: document.querySelector("#kogol0DetailSummary"),
      table: document.querySelector("#kogol0DetailTable"),
      more: document.querySelector("#kogol0DetailMore"),
    };
    if (!elements.panel) return { open: async () => {}, reset: () => {} };

    let selectedSummary = null;
    let officers = [];
    let selectedOfficer = null;
    let shown = PAGE_SIZE;
    let requestId = 0;

    function setMessage(message) {
      elements.status.textContent = message;
      elements.summary.innerHTML = "";
      elements.table.innerHTML = `<div class="kogol0-detail-empty">${escapeHtml(message)}</div>`;
      elements.more.hidden = true;
    }

    function renderOfficers() {
      selectedOfficer = null;
      elements.back.hidden = true;
      elements.heading.textContent = "Rincian Kogol 0 per Petugas";
      elements.search.placeholder = "Cari petugas";
      const filtered = officers.filter((item) => item.name.toLocaleLowerCase("id-ID").includes(elements.search.value.toLocaleLowerCase("id-ID")));
      elements.summary.innerHTML = `<span><strong>${formatNumber(selectedSummary.unpaidId)}</strong> IDPEL tersisa</span>
        <span><strong>${formatRupiah(selectedSummary.unpaidRupiah)}</strong> saldo akhir</span>
        <span><strong>${formatNumber(officers.filter((item) => item.count).length)}</strong> petugas dengan tunggakan</span>`;
      elements.table.innerHTML = `<div class="kogol0-detail-scroll"><table class="kogol0-officers-table">
        <thead><tr><th scope="col">#</th><th scope="col">Petugas</th><th scope="col" class="numeric">Sisa IDPEL</th><th scope="col" class="numeric">Sisa tagihan</th><th scope="col" aria-label="Buka pelanggan"></th></tr></thead>
        <tbody>${filtered.map((item, index) => `<tr><td>${index + 1}</td><td><button class="kogol0-officer-button" type="button" data-officer="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button></td><td class="numeric">${formatNumber(item.count)}</td><td class="numeric amount">${formatRupiah(item.amount)}</td><td><button class="icon-button kogol0-open-button" type="button" data-officer="${escapeHtml(item.name)}" title="Lihat pelanggan ${escapeHtml(item.name)}" aria-label="Lihat pelanggan ${escapeHtml(item.name)}"><i data-lucide="chevron-right" aria-hidden="true"></i></button></td></tr>`).join("")}</tbody>
      </table></div>${filtered.length ? "" : '<div class="kogol0-detail-empty">Petugas tidak ditemukan.</div>'}`;
      elements.more.hidden = true;
      window.lucide?.createIcons({ nodes: [elements.table] });
    }

    function renderCustomers() {
      const officer = officers.find((item) => item.name === selectedOfficer);
      if (!officer) return renderOfficers();
      elements.back.hidden = false;
      elements.heading.textContent = officer.name;
      elements.search.placeholder = "Cari IDPEL, nama, atau alamat";
      const term = elements.search.value.trim().toLocaleLowerCase("id-ID");
      const filtered = officer.rows.filter((row) => [row.idpel, row.nama, row.alamat]
        .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(term)));
      const visible = filtered.slice(0, shown);
      elements.summary.innerHTML = `<span><strong>${formatNumber(officer.count)}</strong> IDPEL tersisa</span>
        <span><strong>${formatRupiah(officer.amount)}</strong> total tagihan</span>
        <span>Diurutkan dari tagihan terbesar</span>`;
      elements.table.innerHTML = `<div class="kogol0-detail-scroll"><table class="kogol0-customers-table">
        <thead><tr><th scope="col">#</th><th scope="col">IDPEL</th><th scope="col">Pelanggan</th><th scope="col">Alamat</th><th scope="col">Tarif / Daya</th><th scope="col" class="numeric">Tagihan</th></tr></thead>
        <tbody>${visible.map((row, index) => `<tr><td>${index + 1}</td><td class="idpel">${escapeHtml(row.idpel)}</td><td class="customer-name">${escapeHtml(row.nama)}</td><td>${escapeHtml(row.alamat || "-")}</td><td>${escapeHtml([row.tarif, row.daya].filter(Boolean).join(" / ") || "-")}</td><td class="numeric amount">${formatRupiah(row.rptag)}</td></tr>`).join("")}</tbody>
      </table></div>${filtered.length ? "" : '<div class="kogol0-detail-empty">Pelanggan tidak ditemukan.</div>'}`;
      elements.more.hidden = visible.length >= filtered.length;
      if (!elements.more.hidden) elements.more.textContent = `Tampilkan lagi (${formatNumber(filtered.length - visible.length)} tersisa)`;
    }

    function localRows(summary) {
      const state = getState();
      if (wibDate(state.uploadMeta?.akhir?.uploadedAt) !== summary.closing?.snapshotDate) return null;
      const rows = [...(state.remainingByPetugas?.values() || [])].flat();
      return matchesSnapshot(rows, summary) ? rows : null;
    }

    async function onlineRows(summary) {
      const client = getState().supabaseClient;
      if (!client) throw new Error("Data pelanggan tidak tersedia di browser ini. Masuk sebagai admin untuk mengambil data online.");
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client.from("monitoring_remaining_customers")
          .select("id,petugas,idpel,nama,tarif,daya,alamat,rptag,uploaded_at")
          .eq("report_id", "main").order("id", { ascending: true }).range(offset, offset + 999);
        if (error) throw new Error(`Gagal mengambil rincian pelanggan: ${error.message}`);
        const page = data || [];
        if (page.some((row) => wibDate(row.uploaded_at) !== summary.closing.snapshotDate)) {
          throw new Error("Rincian online berasal dari tanggal unggahan lain. Pilih bulan snapshot terbaru atau unggah ulang Saldo Akhir Kogol 0.");
        }
        rows.push(...page);
        if (page.length < 1000) break;
      }
      if (!matchesSnapshot(rows, summary)) {
        throw new Error(`Rincian pelanggan belum cocok dengan snapshot ${summary.closing.snapshotDate} (${formatNumber(rows.length)} dari ${formatNumber(summary.unpaidId)} IDPEL). Periksa DIL dan unggah ulang Saldo Akhir Kogol 0.`);
      }
      return rows;
    }

    async function open(summary) {
      const current = ++requestId;
      if (getState().profile?.role !== "admin") {
        setMessage("Rincian Kogol 0 hanya dapat dilihat admin.");
        return;
      }
      selectedSummary = summary;
      selectedOfficer = null;
      elements.search.value = "";
      elements.heading.textContent = "Rincian Kogol 0 per Petugas";
      elements.back.hidden = true;
      if (!summary?.closing) {
        setMessage("Belum ada snapshot Kogol 0 untuk bulan ini.");
        return;
      }
      setMessage("Memuat rincian pelanggan Kogol 0...");
      try {
        const rows = localRows(summary) || await onlineRows(summary);
        if (current !== requestId) return;
        officers = buildOfficers(rows, getOfficerNames());
        elements.status.textContent = `Saldo akhir ${summary.closing.snapshotDate} - ${formatNumber(rows.length)} pelanggan cocok dengan snapshot.`;
        renderOfficers();
      } catch (error) {
        if (current === requestId) setMessage(error.message);
      }
    }

    elements.table.addEventListener("click", (event) => {
      const button = event.target.closest("[data-officer]");
      if (!button) return;
      selectedOfficer = button.dataset.officer;
      shown = PAGE_SIZE;
      elements.search.value = "";
      renderCustomers();
    });
    elements.back.addEventListener("click", () => {
      selectedOfficer = null;
      elements.search.value = "";
      renderOfficers();
    });
    elements.search.addEventListener("input", () => {
      shown = PAGE_SIZE;
      if (selectedOfficer) renderCustomers(); else if (selectedSummary && officers.length) renderOfficers();
    });
    elements.more.addEventListener("click", () => { shown += PAGE_SIZE; renderCustomers(); });

    function reset() {
      requestId += 1;
      selectedSummary = null;
      selectedOfficer = null;
      officers = [];
      elements.search.value = "";
      setMessage("Pilih Kogol 0 di dashboard untuk melihat rincian.");
    }
    return { open, reset };
  }

  return { create, buildOfficers, sortCustomers, matchesSnapshot, wibDate };
});
