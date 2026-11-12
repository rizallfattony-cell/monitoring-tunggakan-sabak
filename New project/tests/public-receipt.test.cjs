const assert = require('node:assert/strict');
const { parseIdpels, escapeHtml, money, periodsLabel, receiptMarkup, printSheets, makeReceipt, prepareCustomers } = require('../cetak-struk.js');

assert.deepEqual(parseIdpels('143900000001\n143900000002,143900000003'), ['143900000001', '143900000002', '143900000003']);
assert.throws(() => parseIdpels('143900000001 143900000001'), /unik/);
assert.throws(() => parseIdpels('14390x000001'), /10-16/);
assert.throws(() => parseIdpels(Array.from({ length: 21 }, (_, i) => `1439000000${String(i).padStart(2, '0')}`).join('\n')), /20/);
assert.equal(money(5644198824), 'Rp\u00a05.644.198.824');
assert.equal(periodsLabel(['202610', '202611']), 'Okt 2026, Nov 2026');
assert.equal(escapeHtml('<script>'), '&lt;script&gt;');

const base = { idpel: '143900000001', nama: '<script>alert(1)</script>', tarif: 'R1', daya: '900', rptag: 359152, admin_fee: 5000, stand_awal: '100', stand_akhir: '120', billing_periods: ['202610'] };
const receipt = makeReceipt(base, new Date('2026-11-12T03:04:05Z'));
assert.equal(receipt.total, 364152);
assert.match(receiptMarkup(receipt), /Rp&nbsp;364\.152|Rp\u00a0364\.152/);
assert.match(receiptMarkup(receipt), /BUKAN BUKTI PEMBAYARAN/);
assert.doesNotMatch(receiptMarkup(receipt), /<script>/);
assert.match(receiptMarkup(receipt), /100-120/);
assert.match(receiptMarkup(receipt), /Okt 2026/);
assert.match(receiptMarkup(receipt, 'data:image/png;base64,aGVsbG8='), /class="receipt-logo"/);
assert.doesNotMatch(receiptMarkup(receipt, 'javascript:alert(1)'), /class="receipt-logo"/);
assert.equal((printSheets([receipt, receipt, receipt]).match(/class="print-sheet"/g) || []).length, 2);
assert.equal((printSheets([receipt, receipt, receipt]).match(/class="receipt-slot">/g) || []).length, 3);
assert.throws(() => makeReceipt({ ...base, rptag: -1 }), /tidak valid/);
assert.deepEqual(prepareCustomers(['143900000001', '143900000002'], [{ ...base, rptag: 0 }, { ...base, rptag: 200, uploaded_at: '2026-11-12T00:00:00Z' }], [], null).map(row => row.rptag), [200]);

console.log('PASS public receipt: validation, exact values, escaping and A4 grouping');
