const assert = require('node:assert/strict');
const detail = require('../kogol0-detail.js');

const rows = [
  { petugas: 'ADRI', idpel: '2', rptag: 50000 },
  { petugas: 'ADRI', idpel: '1', rptag: 150000 },
  { petugas: 'AMRIZAL', idpel: '3', rptag: 300000 },
];
const officers = detail.buildOfficers(rows, ['ADRI', 'AMRIZAL', 'BUNJAMIN']);
assert.deepEqual(officers.map((item) => [item.name, item.count, item.amount]), [
  ['AMRIZAL', 1, 300000], ['ADRI', 2, 200000], ['BUNJAMIN', 0, 0],
]);
assert.deepEqual(officers[1].rows.map((row) => row.idpel), ['1', '2']);
assert.equal(detail.matchesSnapshot(rows, { closing: {}, unpaidId: 3, unpaidRupiah: 500000 }), true);
assert.equal(detail.matchesSnapshot(rows, { closing: {}, unpaidId: 4, unpaidRupiah: 500000 }), false);
assert.equal(detail.matchesSnapshot(rows, { closing: {}, unpaidId: 3, unpaidRupiah: 490000 }), false);
assert.equal(detail.wibDate('2026-10-31T18:00:00Z'), '2026-11-01');
console.log('PASS Kogol 0 detail grouping, sorting, snapshot checks and WIB date');
