const assert = require('node:assert/strict');
const {
  normalizeRows,
  buildSummary,
  buildDonut,
  validMonth,
  formatMonth,
} = require('../kogol-dashboard.js');

const rows = normalizeRows([
  { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_0', saldo_id: 100, saldo_rupiah: 1200000 },
  { snapshot_date: '2026-11-05', kogol_key: 'KOGOL_0', saldo_id: 25, saldo_rupiah: 300000 },
  { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 40, saldo_rupiah: 800000 },
  { snapshot_date: '2026-11-05', kogol_key: 'KOGOL_3_PERKANTORAN', saldo_id: 10, saldo_rupiah: 200000 },
  { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_3_LPJU', saldo_id: 20, saldo_rupiah: 400000 },
  { snapshot_date: '2026-11-05', kogol_key: 'KOGOL_3_LPJU', saldo_id: 5, saldo_rupiah: 100000 },
  { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_4', saldo_id: 4, saldo_rupiah: 100000 },
]);

assert.equal(rows.length, 7);
assert.equal(rows[0].kogolKey, 'KOGOL_0');
assert.equal(normalizeRows([{ snapshot_date: '2026-11-01', kogol_key: 'LAIN', saldo_id: 1, saldo_rupiah: 1 }]).length, 0);

const summaries = buildSummary(rows, '2026-11');
assert.equal(summaries.length, 4);
const kogol0 = summaries.find((item) => item.key === 'KOGOL_0');
assert.equal(kogol0.paidId, 75);
assert.equal(kogol0.unpaidId, 25);
assert.equal(kogol0.paidRupiah, 900000);
assert.equal(kogol0.rate, 75);
const lpju = summaries.find((item) => item.key === 'KOGOL_3_LPJU');
assert.equal(lpju.rate, 75);
const kogol4 = summaries.find((item) => item.key === 'KOGOL_4');
assert.equal(kogol4.paidId, 0, 'one baseline snapshot does not invent paid customers');
assert.equal(kogol4.unpaidId, 4);
assert.equal(kogol4.rate, null, 'opening alone does not show a settlement percentage');
const closingFirst = buildSummary([
  { snapshot_date: '2026-11-05', kogol_key: 'KOGOL_4', saldo_id: 6, saldo_rupiah: 60000 },
], '2026-11').find((item) => item.key === 'KOGOL_4');
assert.equal(closingFirst.opening, null, 'a closing snapshot must not become the opening balance');
assert.equal(closingFirst.unpaidId, 6);
assert.equal(closingFirst.rate, null);
const openingAddedLater = buildSummary([
  { snapshot_date: '2026-11-05', kogol_key: 'KOGOL_4', saldo_id: 6, saldo_rupiah: 60000 },
  { snapshot_date: '2026-11-01', kogol_key: 'KOGOL_4', saldo_id: 10, saldo_rupiah: 100000 },
], '2026-11').find((item) => item.key === 'KOGOL_4');
assert.equal(openingAddedLater.paidId, 4);
assert.equal(openingAddedLater.rate, 40);
assert.match(buildDonut(kogol0), /<svg/);
assert.match(buildDonut(kogol0), /75%/);
assert.match(buildDonut({ available: false }), /Belum ada data/);
assert.equal(validMonth('2026-11'), '2026-11');
assert.match(formatMonth('2026-11'), /November 2026/);

console.log('PASS Kogol dashboard JS: snapshots, paid balances, donut and empty state');
