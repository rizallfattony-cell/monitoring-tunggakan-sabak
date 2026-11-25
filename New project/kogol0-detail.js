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

  function formatPercent(value) {
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(number(value))}%`;
  }

  function percentage(part, total) {
    return number(total) ? (number(part) * 100) / number(total) : 0;
  }

  function percentMeter(value) {
    const width = Math.max(0, Math.min(100, Math.round(number(value))));
    return `<div class="percent-meter" style="--value:${width}%"><div class="percent-fill"></div><span>${formatPercent(value)}</span></div>`;
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
      clearSearch: document.querySelector("#kogol0DetailClearSearch"),
      sort: document.querySelector("#kogol0DetailSort"),
      exportButton: document.querySelector("#kogol0DetailExport"),
      tableTitle: document.querySelector("#kogol0DetailTableTitle"),
      filteredCount: document.querySelector("#kogol0DetailFilteredCount"),
      summary: document.querySelector("#kogol0DetailSummary"),
      table: document.querySelector("#kogol0DetailTable"),
      more: document.querySelector("#kogol0DetailMore"),
      previewBackdrop: document.querySelector("#kogol0PreviewBackdrop"),
      previewDrawer: document.querySelector("#kogol0PreviewDrawer"),
      previewTitle: document.querySelector("#kogol0PreviewTitle"),
      previewSubtitle: document.querySelector("#kogol0PreviewSubtitle"),
      previewSummary: document.querySelector("#kogol0PreviewSummary"),
      previewList: document.querySelector("#kogol0PreviewList"),
      previewFooterText: document.querySelector("#kogol0PreviewFooterText"),
      previewClose: document.querySelector("#kogol0PreviewClose"),
      previewViewAll: document.querySelector("#kogol0PreviewViewAll"),
    };
    if (!elements.panel) return { open: async () => {}, reset: () => {} };

    let selectedSummary = null;
    let officers = [];
    let selectedOfficer = null;
    let shown = PAGE_SIZE;
    let requestId = 0;
    let viewMode = "officers";
    let previewOfficer = null;
    let previewTrigger = null;

    function refreshIcons(nodes) {
      window.lucide?.createIcons({ nodes: nodes.filter(Boolean) });
    }

    function setControlsEnabled(enabled) {
      elements.search.disabled = !enabled;
      elements.sort.disabled = !enabled;
      elements.exportButton.disabled = !enabled;
    }

    function setSortOptions(mode) {
      if (elements.sort.dataset.mode === mode) return;
      const optionsByMode = {
        officers: [
          ["amountDesc", "Tagihan tertinggi"],
          ["percentDesc", "Pelunasan tertinggi"],
          ["percentAsc", "Pelunasan terendah"],
          ["openingDesc", "Saldo awal terbesar"],
          ["countDesc", "IDPEL terbanyak"],
          ["nameAsc", "Nama A-Z"],
        ],
        customers: [
          ["amountDesc", "Tagihan tertinggi"],
          ["idpelAsc", "IDPEL terkecil"],
          ["nameAsc", "Nama A-Z"],
        ],
      };
      elements.sort.innerHTML = optionsByMode[mode]
        .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
      elements.sort.dataset.mode = mode;
      elements.sort.value = "amountDesc";
    }

    function renderSummary(cards) {
      const allowedTones = new Set(["cyan", "amber", "teal"]);
      elements.summary.innerHTML = cards.map((card) => {
        const tone = allowedTones.has(card.tone) ? card.tone : "cyan";
        return `<article class="kogol0-kpi-card is-${tone}">
          <div class="kogol0-kpi-copy"><span class="kogol0-kpi-label">${escapeHtml(card.label)}</span>
            <strong class="kogol0-kpi-value">${escapeHtml(card.value)}</strong>
            <span class="kogol0-kpi-note"><i data-lucide="${escapeHtml(card.noteIcon || "circle")}" aria-hidden="true"></i>${escapeHtml(card.note)}</span>
          </div>
          <span class="kogol0-kpi-icon" aria-hidden="true"><i data-lucide="${escapeHtml(card.icon)}"></i></span>
        </article>`;
      }).join("");
      refreshIcons([elements.summary]);
    }

    function emptyState(title, description) {
      return `<div class="kogol0-detail-empty"><span class="kogol0-empty-icon" aria-hidden="true"><i data-lucide="search-x"></i></span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
    }

    function tableFooter(helpText, totalIdpel, totalAmount) {
      return `<footer class="kogol0-table-footer"><span>${escapeHtml(helpText)}</span><div><strong>${formatNumber(totalIdpel)} IDPEL</strong><strong>${formatRupiah(totalAmount)}</strong></div></footer>`;
    }

    function updateSearchState() {
      elements.clearSearch.hidden = !elements.search.value;
    }

    function closePreview({ restoreFocus = true } = {}) {
      if (elements.previewDrawer.hidden) return;
      elements.previewDrawer.classList.remove("is-open");
      elements.previewBackdrop.classList.remove("is-open");
      elements.previewDrawer.hidden = true;
      elements.previewBackdrop.hidden = true;
      document.body.classList.remove("is-kogol0-preview-open");
      if (restoreFocus) previewTrigger?.focus();
      previewOfficer = null;
      previewTrigger = null;
    }

    function openPreview(officerName, trigger) {
      const officer = officers.find((item) => item.name === officerName);
      if (!officer) return;
      const priorityRows = officer.rows.slice(0, 10);
      const priorityAmount = priorityRows.reduce((total, row) => total + number(row.rptag), 0);
      previewOfficer = officer.name;
      previewTrigger = trigger || null;
      elements.previewTitle.textContent = officer.name;
      elements.previewSubtitle.textContent = `${formatNumber(officer.count)} IDPEL dengan total ${formatRupiah(officer.amount)}.`;
      elements.previewSummary.innerHTML = `<article><span>Total IDPEL</span><strong>${formatNumber(officer.count)}</strong><small>Pelanggan menunggak</small></article>
        <article><span>Total tagihan</span><strong>${formatRupiah(officer.amount)}</strong><small>Akumulasi petugas</small></article>
        <article><span>Top 10 tagihan</span><strong>${formatRupiah(priorityAmount)}</strong><small>Prioritas tertinggi</small></article>`;
      elements.previewList.innerHTML = priorityRows.length ? priorityRows.map((row, index) => `<article class="kogol0-preview-item">
        <span class="kogol0-preview-rank">${index + 1}</span>
        <div class="kogol0-preview-customer"><strong>${escapeHtml(row.idpel)}</strong><span>${escapeHtml(row.nama || "Nama pelanggan tidak tersedia")}</span><small>${escapeHtml([row.tarif, row.daya].filter(Boolean).join(" / ") || "-")} - ${escapeHtml(row.alamat || "Alamat tidak tersedia")}</small></div>
        <strong class="kogol0-preview-amount">${formatRupiah(row.rptag)}</strong>
      </article>`).join("") : `<div class="kogol0-preview-empty"><i data-lucide="circle-check" aria-hidden="true"></i><strong>Tidak ada IDPEL menunggak</strong><span>Petugas ini tidak memiliki tagihan untuk ditampilkan.</span></div>`;
      elements.previewFooterText.textContent = `Menampilkan ${formatNumber(priorityRows.length)} dari ${formatNumber(officer.count)} IDPEL milik ${officer.name}.`;
      elements.previewViewAll.disabled = officer.count === 0;
      elements.previewBackdrop.hidden = false;
      elements.previewDrawer.hidden = false;
      document.body.classList.add("is-kogol0-preview-open");
      requestAnimationFrame(() => {
        elements.previewBackdrop.classList.add("is-open");
        elements.previewDrawer.classList.add("is-open");
      });
      refreshIcons([elements.previewDrawer]);
      elements.previewClose.focus();
    }

    function showAllPreviewRows() {
      if (!previewOfficer) return;
      const officerName = previewOfficer;
      closePreview({ restoreFocus: false });
      selectedOfficer = officerName;
      shown = PAGE_SIZE;
      elements.search.value = "";
      elements.sort.dataset.mode = "";
      renderCustomers();
    }

    function setMessage(message) {
      elements.status.textContent = message;
      elements.heading.textContent = "Rincian Kogol 0 per Petugas";
      elements.tableTitle.textContent = "Monitoring Tunggakan per Petugas";
      elements.filteredCount.textContent = "Menunggu data rincian";
      elements.summary.innerHTML = "";
      elements.table.innerHTML = emptyState("Rincian belum tersedia", message);
      elements.more.hidden = true;
      elements.back.hidden = true;
      setControlsEnabled(false);
      refreshIcons([elements.table]);
    }

    function monitoringRows() {
      const reportMap = new Map((getState().report || []).map((row) => [String(row.petugas || "").trim(), row]));
      return officers.map((officer) => {
        const report = reportMap.get(officer.name);
        const awalId = number(report?.awalId);
        const awalRupiah = number(report?.awalRupiah);
        const akhirId = report ? number(report.akhirId) : officer.count;
        const akhirRupiah = report ? number(report.akhirRupiah) : officer.amount;
        const pelunasanPel = report ? number(report.pelunasanPel) : Math.max(0, awalId - akhirId);
        const pelunasanRupiah = report ? number(report.pelunasanRupiah) : Math.max(0, awalRupiah - akhirRupiah);
        return {
          ...officer,
          awalId,
          awalRupiah,
          akhirId,
          akhirRupiah,
          pelunasanPel,
          pelunasanRupiah,
          persenPel: report ? number(report.persenPel) : percentage(pelunasanPel, awalId),
          persenTagihan: report ? number(report.persenTagihan) : percentage(pelunasanRupiah, awalRupiah),
        };
      });
    }

    function monitoringTotals(rows) {
      const totals = rows.reduce((acc, row) => {
        acc.awalId += row.awalId;
        acc.awalRupiah += row.awalRupiah;
        acc.akhirId += row.akhirId;
        acc.akhirRupiah += row.akhirRupiah;
        acc.pelunasanPel += row.pelunasanPel;
        acc.pelunasanRupiah += row.pelunasanRupiah;
        return acc;
      }, { awalId: 0, awalRupiah: 0, akhirId: 0, akhirRupiah: 0, pelunasanPel: 0, pelunasanRupiah: 0 });
      totals.persenPel = percentage(totals.pelunasanPel, totals.awalId);
      totals.persenTagihan = percentage(totals.pelunasanRupiah, totals.awalRupiah);
      return totals;
    }

    function filteredOfficers() {
      const term = elements.search.value.trim().toLocaleLowerCase("id-ID");
      const filtered = monitoringRows().filter((item) => item.name.toLocaleLowerCase("id-ID").includes(term));
      if (elements.sort.value === "countDesc") {
        return filtered.sort((a, b) => b.akhirId - a.akhirId || b.akhirRupiah - a.akhirRupiah || a.name.localeCompare(b.name, "id-ID"));
      }
      if (elements.sort.value === "percentDesc") {
        return filtered.sort((a, b) => b.persenTagihan - a.persenTagihan || b.akhirRupiah - a.akhirRupiah);
      }
      if (elements.sort.value === "percentAsc") {
        return filtered.sort((a, b) => a.persenTagihan - b.persenTagihan || b.akhirRupiah - a.akhirRupiah);
      }
      if (elements.sort.value === "openingDesc") {
        return filtered.sort((a, b) => b.awalRupiah - a.awalRupiah || b.akhirRupiah - a.akhirRupiah);
      }
      if (elements.sort.value === "nameAsc") {
        return filtered.sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
      }
      return filtered.sort((a, b) => b.akhirRupiah - a.akhirRupiah || b.akhirId - a.akhirId || a.name.localeCompare(b.name, "id-ID"));
    }

    function filteredCustomers(officer) {
      const term = elements.search.value.trim().toLocaleLowerCase("id-ID");
      const filtered = officer.rows.filter((row) => [row.idpel, row.nama, row.alamat]
        .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(term)));
      if (elements.sort.value === "idpelAsc") {
        return filtered.sort((a, b) => String(a.idpel || "").localeCompare(String(b.idpel || ""), "id-ID", { numeric: true }));
      }
      if (elements.sort.value === "nameAsc") {
        return filtered.sort((a, b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id-ID"));
      }
      return sortCustomers(filtered);
    }

    function monitoringRowClass(row) {
      if (row.awalId > 0 && row.akhirId === 0 && row.akhirRupiah === 0) return "is-complete";
      if (row.persenTagihan < 60) return "is-priority";
      if (row.persenTagihan < 85) return "is-warning";
      return "is-good";
    }

    function monitoringTableRow(item, index) {
      const hasCustomers = item.count > 0;
      return `<tr class="${monitoringRowClass(item)}">
        <td>${index + 1}</td>
        <td class="kogol0-monitoring-name">${escapeHtml(item.name)}</td>
        <td class="numeric">${formatNumber(item.awalId)}</td>
        <td class="numeric amount">${formatRupiah(item.awalRupiah)}</td>
        <td class="numeric">${formatNumber(item.akhirId)}</td>
        <td class="numeric amount">${formatRupiah(item.akhirRupiah)}</td>
        <td class="numeric">${formatNumber(item.pelunasanPel)}</td>
        <td class="numeric amount">${formatRupiah(item.pelunasanRupiah)}</td>
        <td class="numeric percent-cell">${percentMeter(item.persenPel)}</td>
        <td class="numeric percent-cell">${percentMeter(item.persenTagihan)}</td>
        <td><button class="icon-button kogol0-open-button" type="button"${hasCustomers ? ` data-preview-officer="${escapeHtml(item.name)}"` : " disabled"} title="${hasCustomers ? `Lihat 10 tagihan terbesar ${escapeHtml(item.name)}` : "Tidak ada IDPEL menunggak"}" aria-label="${hasCustomers ? `Lihat 10 tagihan terbesar ${escapeHtml(item.name)}` : `Tidak ada IDPEL menunggak untuk ${escapeHtml(item.name)}`}"${hasCustomers ? "" : ' aria-disabled="true"'}><i data-lucide="chevron-right" aria-hidden="true"></i></button></td>
      </tr>`;
    }

    function monitoringTotalRow(totals) {
      return `<tr><td colspan="2">TOTAL</td><td class="numeric">${formatNumber(totals.awalId)}</td><td class="numeric amount">${formatRupiah(totals.awalRupiah)}</td><td class="numeric">${formatNumber(totals.akhirId)}</td><td class="numeric amount">${formatRupiah(totals.akhirRupiah)}</td><td class="numeric">${formatNumber(totals.pelunasanPel)}</td><td class="numeric amount">${formatRupiah(totals.pelunasanRupiah)}</td><td class="numeric percent-cell">${percentMeter(totals.persenPel)}</td><td class="numeric percent-cell">${percentMeter(totals.persenTagihan)}</td><td></td></tr>`;
    }

    function renderOfficers() {
      selectedOfficer = null;
      viewMode = "officers";
      setSortOptions(viewMode);
      setControlsEnabled(true);
      elements.back.hidden = true;
      elements.heading.textContent = "Rincian Kogol 0 per Petugas";
      elements.status.textContent = `Saldo akhir ${selectedSummary.closing.snapshotDate} - ${formatNumber(selectedSummary.unpaidId)} pelanggan cocok dengan snapshot.`;
      elements.tableTitle.textContent = "Monitoring Tunggakan per Petugas";
      elements.search.placeholder = "Cari nama petugas";
      const filtered = filteredOfficers();
      const totals = monitoringTotals(monitoringRows());
      const activeOfficerCount = officers.filter((item) => item.count > 0).length;

      renderSummary([
        { label: "Total IDPEL tersisa", value: formatNumber(selectedSummary.unpaidId), note: "Pelanggan menunggak", icon: "users", noteIcon: "circle", tone: "cyan" },
        { label: "Total saldo akhir", value: formatRupiah(selectedSummary.unpaidRupiah), note: "Akumulasi tunggakan Kogol 0", icon: "wallet", noteIcon: "circle-alert", tone: "amber" },
        { label: "Petugas terdampak", value: `${formatNumber(activeOfficerCount)} petugas`, note: "Memiliki tunggakan aktif", icon: "user-check", noteIcon: "circle", tone: "teal" },
      ]);
      elements.filteredCount.textContent = `Menampilkan ${formatNumber(filtered.length)} dari ${formatNumber(officers.length)} petugas`;
      elements.exportButton.disabled = !filtered.length;

      if (!filtered.length) {
        elements.table.innerHTML = emptyState("Petugas tidak ditemukan", "Tidak ada nama petugas yang cocok dengan pencarian Anda.");
      } else {
        elements.table.innerHTML = `<div class="kogol0-detail-scroll"><table class="kogol0-officers-table kogol0-monitoring-table">
          <thead><tr><th scope="col" rowspan="2">#</th><th scope="col" rowspan="2">Petugas</th><th scope="col" colspan="2">Saldo Awal</th><th scope="col" colspan="2">Saldo Akhir</th><th scope="col" colspan="2">Pelunasan</th><th scope="col" colspan="2">Persentase</th><th scope="col" rowspan="2" aria-label="Buka pelanggan">Aksi</th></tr>
          <tr><th scope="col" class="numeric">IDPEL</th><th scope="col" class="numeric">Tagihan</th><th scope="col" class="numeric">IDPEL</th><th scope="col" class="numeric">Tagihan</th><th scope="col" class="numeric">IDPEL</th><th scope="col" class="numeric">Tagihan</th><th scope="col" class="numeric">IDPEL</th><th scope="col" class="numeric">Tagihan</th></tr></thead>
          <tbody>${filtered.map(monitoringTableRow).join("")}</tbody><tfoot>${monitoringTotalRow(totals)}</tfoot>
        </table></div><footer class="kogol0-monitoring-help">Klik tombol aksi untuk melihat 10 IDPEL dengan tagihan terbesar.</footer>`;
      }
      elements.more.hidden = true;
      updateSearchState();
      refreshIcons([elements.table]);
    }

    function renderCustomers() {
      const officer = officers.find((item) => item.name === selectedOfficer);
      if (!officer) return renderOfficers();
      viewMode = "customers";
      setSortOptions(viewMode);
      setControlsEnabled(true);
      elements.back.hidden = false;
      elements.heading.textContent = `Rincian Pelanggan ${officer.name}`;
      elements.status.textContent = `Saldo akhir ${selectedSummary.closing.snapshotDate} - ${formatNumber(officer.count)} pelanggan ditangani ${officer.name}.`;
      elements.tableTitle.textContent = `Daftar Pelanggan ${officer.name}`;
      elements.search.placeholder = "Cari IDPEL, nama, atau alamat";
      const filtered = filteredCustomers(officer);
      const visible = filtered.slice(0, shown);
      const filteredAmount = filtered.reduce((total, row) => total + number(row.rptag), 0);

      renderSummary([
        { label: "IDPEL petugas", value: formatNumber(officer.count), note: "Pelanggan menunggak", icon: "users", noteIcon: "circle", tone: "cyan" },
        { label: "Total tagihan", value: formatRupiah(officer.amount), note: "Akumulasi pelanggan petugas", icon: "wallet", noteIcon: "circle-alert", tone: "amber" },
        { label: "Data ditampilkan", value: formatNumber(filtered.length), note: `Dari ${formatNumber(officer.count)} pelanggan`, icon: "list-filter", noteIcon: "circle", tone: "teal" },
      ]);
      elements.filteredCount.textContent = `Menampilkan ${formatNumber(visible.length)} dari ${formatNumber(filtered.length)} hasil`;
      elements.exportButton.disabled = !filtered.length;

      if (!filtered.length) {
        elements.table.innerHTML = emptyState("Pelanggan tidak ditemukan", "Tidak ada IDPEL, nama, atau alamat yang cocok dengan pencarian Anda.");
      } else {
        elements.table.innerHTML = `<div class="kogol0-detail-scroll"><table class="kogol0-customers-table">
          <thead><tr><th scope="col">#</th><th scope="col">IDPEL</th><th scope="col">Pelanggan</th><th scope="col">Alamat</th><th scope="col">Tarif / Daya</th><th scope="col" class="numeric">Tagihan</th></tr></thead>
          <tbody>${visible.map((row, index) => `<tr><td>${index + 1}</td><td class="idpel">${escapeHtml(row.idpel)}</td><td class="customer-name">${escapeHtml(row.nama)}</td><td>${escapeHtml(row.alamat || "-")}</td><td>${escapeHtml([row.tarif, row.daya].filter(Boolean).join(" / ") || "-")}</td><td class="numeric amount">${formatRupiah(row.rptag)}</td></tr>`).join("")}</tbody>
        </table></div>${tableFooter("Daftar diurutkan sesuai pilihan pada toolbar.", filtered.length, filteredAmount)}`;
      }
      elements.more.hidden = visible.length >= filtered.length;
      if (!elements.more.hidden) elements.more.textContent = `Tampilkan lagi (${formatNumber(filtered.length - visible.length)} tersisa)`;
      updateSearchState();
      refreshIcons([elements.table]);
    }

    function csvCell(value) {
      const text = String(value ?? "");
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    }

    function downloadCsv(filename, headers, rows) {
      const content = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
      const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function exportCurrentView() {
      if (viewMode === "customers") {
        const officer = officers.find((item) => item.name === selectedOfficer);
        if (!officer) return;
        const rows = filteredCustomers(officer);
        if (!rows.length) return;
        downloadCsv(`kogol-0-${officer.name.toLocaleLowerCase("id-ID").replace(/[^a-z0-9]+/g, "-")}.csv`,
          ["No", "IDPEL", "Pelanggan", "Alamat", "Tarif", "Daya", "Tagihan"],
          rows.map((row, index) => [index + 1, row.idpel, row.nama, row.alamat || "", row.tarif || "", row.daya || "", number(row.rptag)]));
        return;
      }
      const rows = filteredOfficers();
      if (!rows.length) return;
      downloadCsv(`rincian-kogol-0-${selectedSummary.closing.snapshotDate}.csv`,
        ["No", "Petugas", "Saldo Awal IDPEL", "Saldo Awal Tagihan", "Saldo Akhir IDPEL", "Saldo Akhir Tagihan", "Pelunasan IDPEL", "Pelunasan Tagihan", "Persentase IDPEL", "Persentase Tagihan"],
        rows.map((item, index) => [index + 1, item.name, item.awalId, item.awalRupiah, item.akhirId, item.akhirRupiah, item.pelunasanPel, item.pelunasanRupiah, item.persenPel, item.persenTagihan]));
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
      viewMode = "officers";
      elements.search.value = "";
      elements.sort.dataset.mode = "";
      elements.heading.textContent = "Rincian Kogol 0 per Petugas";
      elements.back.hidden = true;
      updateSearchState();
      if (!summary?.closing) {
        setMessage("Belum ada snapshot Kogol 0 untuk bulan ini.");
        return;
      }
      setMessage("Memuat rincian pelanggan Kogol 0...");
      try {
        const rows = localRows(summary) || await onlineRows(summary);
        if (current !== requestId) return;
        officers = buildOfficers(rows, getOfficerNames());
        renderOfficers();
      } catch (error) {
        if (current === requestId) setMessage(error.message);
      }
    }

    elements.table.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preview-officer]");
      if (!button) return;
      openPreview(button.dataset.previewOfficer, button);
    });
    elements.previewBackdrop.addEventListener("click", () => closePreview());
    elements.previewClose.addEventListener("click", () => closePreview());
    elements.previewViewAll.addEventListener("click", showAllPreviewRows);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.previewDrawer.hidden) closePreview();
    });
    elements.back.addEventListener("click", () => {
      selectedOfficer = null;
      elements.search.value = "";
      elements.sort.dataset.mode = "";
      renderOfficers();
    });
    elements.search.addEventListener("input", () => {
      shown = PAGE_SIZE;
      updateSearchState();
      if (selectedOfficer) renderCustomers(); else if (selectedSummary && officers.length) renderOfficers();
    });
    elements.clearSearch.addEventListener("click", () => {
      elements.search.value = "";
      elements.search.focus();
      shown = PAGE_SIZE;
      if (selectedOfficer) renderCustomers(); else if (selectedSummary && officers.length) renderOfficers();
    });
    elements.sort.addEventListener("change", () => {
      shown = PAGE_SIZE;
      if (selectedOfficer) renderCustomers(); else if (selectedSummary && officers.length) renderOfficers();
    });
    elements.exportButton.addEventListener("click", exportCurrentView);
    elements.more.addEventListener("click", () => { shown += PAGE_SIZE; renderCustomers(); });

    function reset() {
      requestId += 1;
      selectedSummary = null;
      selectedOfficer = null;
      officers = [];
      viewMode = "officers";
      elements.search.value = "";
      elements.sort.dataset.mode = "";
      updateSearchState();
      closePreview({ restoreFocus: false });
      setMessage("Pilih Kogol 0 di dashboard untuk melihat rincian.");
    }
    return { open, reset };
  }

  return { create, buildOfficers, sortCustomers, matchesSnapshot, wibDate };
});
