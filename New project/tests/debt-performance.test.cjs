const assert = require('node:assert/strict');
const {
  normalizeDailyRows,
  buildMonthSeries,
  buildLeaderboard,
  buildDailyChart,
  normalizeHistoryPayload,
  buildMonthlyHistoryChart,
  currentWibMonth,
  shiftMonth,
  formatMonth,
} = require('../debt-performance.js');

const rows = normalizeDailyRows([
  { snapshot_date: '2026-10-01', petugas: 'anang ridwan', saldo_id: 100, saldo_rupiah: 1000000 },
  { snapshot_date: '2026-10-01', petugas: 'ADRI', saldo_id: 50, saldo_rupiah: 500000 },
  { snapshot_date: '2026-10-15', petugas: 'ANANG RIDWAN', saldo_id: 60, saldo_rupiah: 600000 },
  { snapshot_date: '2026-10-15', petugas: 'ADRI', saldo_id: 25, saldo_rupiah: 250000 },
  { snapshot_date: '2026-10-31', petugas: 'ANANG RIDWAN', saldo_id: 30, saldo_rupiah: 300000 },
  { snapshot_date: '2026-10-31', petugas: 'ADRI', saldo_id: 10, saldo_rupiah: 100000 },
]);

assert.equal(rows[0].petugas, 'ANANG RIDWAN');
const unit = buildMonthSeries(rows, '2026-10', 'ALL');
assert.equal(unit.available.length, 3);
assert.equal(unit.opening.saldoRupiah, 1500000);
assert.equal(unit.closing.saldoRupiah, 400000);
assert.equal(unit.reductionRupiah, 1100000);
assert.equal(Math.round(unit.rate * 100) / 100, 73.33, 'unit rate is weighted from total rupiah');

const anang = buildMonthSeries(rows, '2026-10', 'ANANG RIDWAN');
assert.equal(anang.opening.saldoId, 100);
assert.equal(anang.closing.saldoId, 30);
assert.equal(anang.rate, 70);
assert.equal(anang.daily[1].available, false, 'missing dates remain gaps');

const leaderboard = buildLeaderboard(rows, '2026-10', ['ANANG RIDWAN', 'ADRI', 'BUNJAMIN']);
assert.equal(leaderboard.length, 3);
assert.equal(leaderboard[0].petugas, 'ADRI');
assert.equal(leaderboard[0].rate, 80);
assert.equal(leaderboard[2].petugas, 'BUNJAMIN');
assert.equal(leaderboard[2].available, false);

const dailyChart = buildDailyChart(unit, buildMonthSeries([], '2026-09', 'ALL'));
assert.match(dailyChart, /<svg/);
assert.match(dailyChart, /Rp/);
assert.match(dailyChart, /performance-chart-value/, 'every uploaded point has a visible compact saldo label');
assert.match(dailyChart, />1<.*>15<.*>31</, 'x-axis labels follow uploaded snapshot days');
assert.doesNotMatch(dailyChart, />5</, 'x-axis does not add calendar dates with no upload');
assert.doesNotMatch(dailyChart, /NaN|undefined/);
assert.match(buildDailyChart(buildMonthSeries([], '2026-10'), buildMonthSeries([], '2026-09')), /Belum ada upload/);

const categoryLeaderboard = buildLeaderboard([
  ...rows,
  { snapshot_date: '2026-10-31', petugas: '<41500-6600', saldo_id: 9, saldo_rupiah: 999999 },
], '2026-10', ['ANANG RIDWAN', 'ADRI', '<41500-6600', '>41500']);
assert.equal(categoryLeaderboard.length, 4, 'the two agreed saldo groups remain leaderboard participants');
assert.equal(categoryLeaderboard.some((row) => row.petugas === '<41500-6600'), true);

const history = normalizeHistoryPayload({ rows: [
  { month: '2026-09-01', available: false },
  { month: '2026-10-01', available: true, awal_rupiah: 1500000, akhir_rupiah: 400000, akhir_id: 40, pelunasan_rupiah: 1100000, persen_tagihan: 73.33 },
] });
assert.equal(history.rows[0].persenTagihan, null);
assert.match(buildMonthlyHistoryChart(history.rows), /<svg/);
assert.match(buildMonthlyHistoryChart([{ month: '2026-10-01', available: false }]), /belum tersedia/i);
assert.equal(currentWibMonth(new Date('2026-09-30T17:30:00Z')), '2026-10');
assert.equal(shiftMonth('2026-01', -1), '2025-12');
assert.match(formatMonth('2026-10'), /Oktober 2026/);

console.log('PASS daily debt performance JS: weighted totals, gaps, leaderboard, charts and WIB dates');
