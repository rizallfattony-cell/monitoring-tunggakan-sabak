const assert = require('node:assert/strict');
const {
  normalizeHistoryPayload,
  buildHistorySummary,
  buildHistoryChart,
  monthFromTimestamp,
  formatMonth,
} = require('../debt-performance.js');

const payload = normalizeHistoryPayload({
  scope: 'ALL',
  is_admin: true,
  end_month: '2026-10-01',
  months: 4,
  officers: ['anang ridwan', 'ADRI', 'ADRI'],
  rows: [
    { month: '2026-07-01', available: false },
    { month: '2026-08-01', available: true, awal_rupiah: 1000, akhir_rupiah: 800, pelunasan_rupiah: 200, persen_tagihan: 20, akhir_id: 8 },
    { month: '2026-09-01', available: true, awal_rupiah: 1000, akhir_rupiah: 500, pelunasan_rupiah: 500, persen_tagihan: 50, akhir_id: 5 },
    { month: '2026-10-01', available: true, awal_rupiah: 1000, akhir_rupiah: 250, pelunasan_rupiah: 750, persen_tagihan: 75, akhir_id: 2 },
  ],
});

assert.equal(payload.rows.length, 4);
assert.deepEqual(payload.officers, ['ANANG RIDWAN', 'ADRI']);
assert.equal(payload.rows[0].persenTagihan, null, 'missing month stays null');
const summary = buildHistorySummary(payload.rows);
assert.equal(summary.available.length, 3);
assert.equal(summary.totalPaid, 1450);
assert.equal(summary.change, 55);
assert.equal(summary.latest.akhirRupiah, 250);
const chart = buildHistoryChart(payload.rows);
assert.match(chart, /<svg/);
assert.match(chart, /75%/);
assert.doesNotMatch(chart, /NaN|undefined/);
assert.match(buildHistoryChart([{ month: '2026-10-01', available: true, persenTagihan: 84 }]), /84%/);
assert.match(buildHistoryChart([{ month: '2026-10-01', available: false }]), /Belum ada snapshot/);
assert.equal(monthFromTimestamp('2026-09-30T17:30:00Z'), '2026-10', 'month uses WIB');
assert.match(formatMonth('2026-10-01', true), /Oktober 2026/);
console.log('PASS debt performance JS: normalization, missing months, summary, chart and WIB month');
