(function (root) {
  "use strict";
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wib = (value) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const currentMonth = () => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
  };
  function buildExportMatrices(month, summary, details) {
    return {
      summary: [
        ["REKAP PENDAPATAN TAMBAHAN SIMONTOK", month],
        ["Petugas", "Struk Asli", "Cetak Ulang", "Pendapatan Tambahan"],
        ...summary.map((r) => [r.petugas, Number(r.transaction_count), Number(r.reprint_count), Number(r.extra_income)]),
        ["TOTAL", ...["transaction_count", "reprint_count", "extra_income"].map((k) => summary.reduce((s, r) => s + Number(r[k]), 0))],
      ],
      details: [
        ["DETAIL TRANSAKSI SIMONTOK", month],
        ["Waktu Asli WIB", "Petugas", "Username", "IDPEL", "Pelanggan", "ID Transaksi", "Referensi", "Tagihan Asli", "Tambahan", "Admin Bank", "Total Bayar", "Cetak Ulang"],
        ...details.map((r) => [wib(r.printed_at), r.petugas, r.username, String(r.idpel), r.customer_name, String(r.transaction_id), String(r.reference),
          Number(r.base_amount), Number(r.extra_amount), Number(r.admin_amount), Number(r.total_amount), Number(r.reprint_count)]),
      ],
    };
  }

  function create({ getState }) {
    const el = (id) => document.getElementById(`receiptHistory${id}`);
    let rows = [], summary = [], total = 0, offset = 0, revision = 0, timer, exporting = false;
    let dataOwner = null;
    const authorized = () => { const s = getState(); return Boolean(s.user && s.profile?.role === "admin" && s.supabaseClient); };
    const identity = () => getState().user?.id;
    const status = (message) => { el("Status").textContent = message; };
    const icons = () => root.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
    el("Month").value = currentMonth();

    function reset() {
      revision++;
      rows = []; summary = []; total = 0; offset = 0; dataOwner = null;
      el("Preview").close(); el("PreviewText").textContent = "";
      render();
      status("");
    }
    async function rpc(name, params) {
      if (!authorized()) throw new Error("Hanya admin yang dapat membuka rekap cetak.");
      const { data, error } = await getState().supabaseClient.rpc(name, params);
      if (error) throw new Error(error.message || "Gagal memuat riwayat.");
      return data;
    }
    function params(pageOffset = offset, limit = 50, all = false) {
      const month = el("Month").value;
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Pilih bulan transaksi.");
      return { p_month: `${month}-01`, p_query: all ? "" : el("Search").value.trim(), p_petugas: all ? null : el("Petugas").value || null, p_offset: pageOffset, p_limit: limit };
    }
    async function load(resetPage = true) {
      if (!authorized()) { reset(); return; }
      if (resetPage) offset = 0;
      const version = ++revision, owner = identity();
      status("Memuat riwayat cetak...");
      el("Export").disabled = true;
      el("Prev").disabled = true; el("Next").disabled = true;
      try {
        const p = params();
        // Summary is always the complete selected month, independent of detail search.
        const recap = await rpc("admin_receipt_monthly_summary", { p_month: p.p_month });
        const details = await rpc("list_receipt_history", p);
        if (version !== revision || !authorized() || identity() !== owner) return;
        summary = recap || []; rows = details.rows || []; total = Number(details.total || 0); dataOwner = owner;
        const selected = el("Petugas").value;
        el("Petugas").innerHTML = '<option value="">Semua petugas</option>' + summary.map((r) => `<option value="${escape(r.petugas)}">${escape(r.petugas)}</option>`).join("");
        el("Petugas").value = selected;
        render();
        status(`Bulan ${el("Month").value} - ${total.toLocaleString("id-ID")} transaksi sesuai filter.`);
      } catch (error) {
        if (version !== revision || identity() !== owner) return;
        rows = []; summary = []; total = 0; dataOwner = null;
        render(); status(`${error.message} Pastikan migrasi riwayat cetak step 21 sudah diterapkan.`);
      } finally { if (version === revision) el("Export").disabled = !dataOwner || exporting; }
    }
    function render() {
      const count = (key) => summary.reduce((s, r) => s + Number(r[key] || 0), 0);
      el("Originals").textContent = count("transaction_count").toLocaleString("id-ID");
      el("Reprints").textContent = count("reprint_count").toLocaleString("id-ID");
      el("Income").textContent = money(count("extra_income"));
      el("Active").textContent = summary.filter((r) => Number(r.transaction_count) > 0).length;
      el("Summary").innerHTML = summary.map((r) => `<tr><td><strong>${escape(r.petugas)}</strong></td><td>${Number(r.transaction_count)}</td><td>${Number(r.reprint_count)}</td><td>${money(r.extra_income)}</td></tr>`).join("") || '<tr><td colspan="4">Belum ada rekap.</td></tr>';
      el("Details").innerHTML = rows.map((r) => `<tr>
        <td>${escape(wib(r.printed_at))}</td><td><strong>${escape(r.petugas)}</strong><small>${escape(r.username)}</small></td>
        <td>${escape(r.idpel)}<small>${escape(r.customer_name)}</small></td>
        <td>${money(r.base_amount)}</td><td>${money(r.extra_amount)}</td><td>${money(r.admin_amount)}</td><td>${money(r.total_amount)}</td>
        <td>${escape(r.reference)}</td><td>${Number(r.reprint_count)}</td>
        <td><button type="button" class="icon-button" data-receipt-id="${escape(r.id)}" title="Lihat struk asli" aria-label="Lihat struk asli"><i data-lucide="eye"></i></button></td>
      </tr>`).join("") || '<tr><td colspan="10">Belum ada transaksi sesuai filter.</td></tr>';
      el("Page").textContent = total ? `${offset + 1}-${Math.min(offset + rows.length, total)} dari ${total}` : "0 transaksi";
      el("Prev").disabled = offset === 0;
      el("Next").disabled = offset + rows.length >= total;
      el("Export").disabled = !dataOwner || exporting;
      icons();
    }
    async function preview(id) {
      const owner = identity(), version = revision;
      if (!authorized() || owner !== dataOwner) return;
      try {
        const snapshot = await rpc("get_receipt_snapshot", { p_id: id });
        if (owner !== identity() || version !== revision || !authorized()) return;
        el("PreviewText").textContent = snapshot.print_text;
        el("Preview").showModal();
      } catch (error) { if (owner === identity()) status(error.message); }
    }
    async function exportMonth() {
      if (!authorized() || exporting || dataOwner !== identity()) return;
      if (!root.XLSX) { status("Excel belum siap. Muat ulang halaman."); return; }
      exporting = true; el("Export").disabled = true;
      const owner = identity(), version = revision, month = el("Month").value;
      try {
        const p = params(0, 200, true), all = [];
        const recap = await rpc("admin_receipt_monthly_summary", { p_month: p.p_month });
        let expected = 0;
        do {
          const page = await rpc("list_receipt_history", { ...p, p_offset: all.length });
          if (!authorized() || owner !== identity() || version !== revision) return;
          expected = Number(page.total); all.push(...page.rows);
          if (page.rows.length === 0 && all.length < expected) throw new Error("Data berubah saat export. Ulangi export.");
          status(`Menyiapkan Excel: ${all.length} / ${expected} transaksi...`);
        } while (all.length < expected);
        const count = (key) => recap.reduce((sum, row) => sum + Number(row[key] || 0), 0);
        if (new Set(all.map((row) => row.id)).size !== all.length || all.length !== count("transaction_count") ||
          all.reduce((sum, row) => sum + Number(row.extra_amount), 0) !== count("extra_income") ||
          all.reduce((sum, row) => sum + Number(row.reprint_count), 0) !== count("reprint_count")) {
          throw new Error("Data berubah saat export. Muat ulang dan ulangi export agar rekap konsisten.");
        }
        const matrices = buildExportMatrices(month, recap, all);
        const workbook = root.XLSX.utils.book_new();
        for (const [key, name] of [["summary", "Rekap Petugas"], ["details", "Detail Transaksi"]]) {
          const matrix = matrices[key], sheet = root.XLSX.utils.aoa_to_sheet(matrix);
          sheet["!cols"] = (key === "summary" ? [26, 15, 15, 24] : [26, 26, 22, 19, 26, 18, 34, 19, 18, 18, 20, 15]).map((wch) => ({ wch }));
          sheet["!autofilter"] = { ref: `A2:${key === "summary" ? "D" : "L"}${key === "summary" ? matrix.length - 1 : matrix.length}` };
          for (let r = 3; r <= matrix.length; r++) for (const col of key === "summary" ? ["D"] : ["H", "I", "J", "K"]) {
            if (sheet[`${col}${r}`]) sheet[`${col}${r}`].z = '"Rp" #,##0';
          }
          root.XLSX.utils.book_append_sheet(workbook, sheet, name);
        }
        root.XLSX.writeFile(workbook, `riwayat-cetak-${month}.xlsx`);
        status(`Excel bulan ${month} berhasil dibuat (${all.length} transaksi).`);
      } catch (error) { if (owner === identity()) status(`Export gagal: ${error.message}`); }
      finally { exporting = false; el("Export").disabled = !authorized() || !dataOwner; }
    }
    el("Month").addEventListener("change", () => load());
    el("Petugas").addEventListener("change", () => load());
    el("Search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load(), 300); });
    el("Refresh").addEventListener("click", () => load(false));
    el("Prev").addEventListener("click", () => { offset = Math.max(0, offset - 50); load(false); });
    el("Next").addEventListener("click", () => { offset += 50; load(false); });
    el("Export").addEventListener("click", exportMonth);
    el("Details").addEventListener("click", (event) => { const button = event.target.closest("[data-receipt-id]"); if (button) preview(button.dataset.receiptId); });
    el("ClosePreview").addEventListener("click", () => el("Preview").close());
    reset();
    return { load, reset, onAuthChange() { if (!authorized() || (dataOwner && dataOwner !== identity())) reset(); } };
  }
  const api = { create, buildExportMatrices, wib, currentMonth };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SimontokReceiptHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
