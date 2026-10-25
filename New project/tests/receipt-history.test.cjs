const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildExportMatrices, wib } = require('../receipt-history.js');
test('Excel separates actual extra income and preserves text identifiers', () => {
 const summary = [{petugas:'ANANG RIDWAN',transaction_count:2,reprint_count:3,extra_income:5000}];
 const rows = [{printed_at:'2020-09-30T17:00:00Z',petugas:'ANANG RIDWAN',username:'14390.anang',idpel:'00143900001',customer_name:'A',transaction_id:'000123',reference:'000REF',base_amount:100000,extra_amount:5000,admin_amount:5000,total_amount:110000,reprint_count:3},
 {printed_at:'2020-10-01T00:00:00Z',petugas:'ANANG RIDWAN',username:'14390.anang',idpel:'00143900002',customer_name:'B',transaction_id:'000124',reference:'000REF2',base_amount:100000,extra_amount:0,admin_amount:5000,total_amount:105000,reprint_count:0}];
 const matrices = buildExportMatrices('2020-10',summary,rows);
 assert.deepEqual(matrices.summary.at(-1),['TOTAL',2,3,5000]);
 assert.equal(matrices.details[2][3],'00143900001');
 assert.equal(matrices.details[2][5],'000123');
 assert.equal(matrices.details[2][8],5000);
 assert.equal(matrices.details[3][8],0);
 assert.equal(matrices.details.length,4);
 assert.match(wib(rows[0].printed_at),/01\/10\/2020/);
});
