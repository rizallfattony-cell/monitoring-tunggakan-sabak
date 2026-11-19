const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const XLSX = require(path.resolve(root, '..', '..', 'qa-receipt-history-1.7.4', 'xlsx.full.min.js'));
const createController = () => ({ create: () => ({}) });
const windowStub = {
  SimontokReceiptHistory: createController(),
  SimontokDebtPerformance: createController(),
  SimontokKogol0Detail: createController(),
  SimontokKogolDashboard: {
    ...createController(),
    wibMonth: () => '2026-11',
  },
};
const context = vm.createContext({
  console,
  window: windowStub,
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  XLSX,
  Intl,
  Date,
  Map,
  Set,
  Promise,
  URL,
  Blob,
  Response,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
});

const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  .replace(/\bboot\(\);\s*\n\s*async function boot/, 'async function boot');
vm.runInContext(source, context, { filename: 'app.js' });

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

test('Kogol 3 finds the LPJU marker when the exported header is unreadable', () => {
  const parsed = evaluate(`parseKogolUploadRows([
    { IDPEL: '001', RPTAG: '1000', KOLOM_7: '14032800 - LPJU MUARA SABAK' },
    { IDPEL: '002', RPTAG: '2000', KOLOM_7: '14040000 - KANTOR ULP SABAK' }
  ], 'kogol3')`);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [
    { kogolKey: 'KOGOL_3_PERKANTORAN', saldoId: 1, saldoRupiah: 2000 },
    { kogolKey: 'KOGOL_3_LPJU', saldoId: 1, saldoRupiah: 1000 },
  ]);
});

test('Excel parser inherits SATKER_MIV from the row above IDPEL', () => {
  context.testSheet = XLSX.utils.aoa_to_sheet([
    ['', '', 'SATKER_MIV'],
    ['IDPEL', 'RPTAG', ''],
    ['001', '1000', '14032800 - LPJU MUARA SABAK'],
  ]);
  const parsed = evaluate('sheetToObjects(testSheet)[0]');
  assert.equal(parsed.SATKER_MIV, '14032800 - LPJU MUARA SABAK');
});

test('header-only Kogol 3 closing file becomes a zero balance for both groups', () => {
  context.headerOnlySheet = XLSX.utils.aoa_to_sheet([
    ['UNITAP', 'UNITUP', 'IDPEL', 'NAMA', 'TARIF', 'DAYA', 'KOGOL', 'SATKER_LEGALISASI', 'SATKER_MIV', 'SUBKOGOL'],
  ]);
  evaluate('headerOnlyRows = sheetToObjects(headerOnlySheet)');
  assert.equal(evaluate('headerOnlyRows.length'), 0);
  assert.equal(evaluate("hasKogolUploadStructure(headerOnlyRows, 'kogol3')"), true);
  assert.equal(evaluate("isEmptyKogolClosingBalance(headerOnlyRows, 'kogol3', 'akhir')"), true);
  assert.equal(evaluate("isEmptyKogolClosingBalance(headerOnlyRows, 'kogol3', 'awal')"), false);
  const snapshots = evaluate("parseKogolUploadRows(headerOnlyRows, 'kogol3')");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots)), [
    { kogolKey: 'KOGOL_3_PERKANTORAN', saldoId: 0, saldoRupiah: 0 },
    { kogolKey: 'KOGOL_3_LPJU', saldoId: 0, saldoRupiah: 0 },
  ]);
});

test('missing SATKER error reports the headers that were actually read', () => {
  assert.throws(
    () => evaluate("parseKogolUploadRows([{ IDPEL: '003', RPTAG: '3000', NAMA: 'UJI' }], 'kogol3')"),
    /Header yang terbaca: IDPEL, RPTAG, NAMA/
  );
});
