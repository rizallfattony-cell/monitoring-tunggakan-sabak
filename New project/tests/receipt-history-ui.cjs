const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const qa = path.resolve(process.env.RECEIPT_QA || path.join(root, '..', '..', 'qa-receipt-history-1.7.4'));
const XLSX = require(path.join(qa, 'xlsx.full.min.js'));
(async () => {
 const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,body) => {
   res.writeHead(error ? 404 : 200, {'Content-Type':({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)] || 'application/octet-stream'});
   res.end(error ? 'not found' : body);
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if (url.pathname.endsWith('app.js')) {
    const body=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('\nboot();','\nwindow.__receiptReady = true;');
    return route.fulfill({body,contentType:'text/javascript'});
   }
   if (url.hostname==='cdn.jsdelivr.net') {
    const name=url.pathname.includes('xlsx')?'xlsx.full.min.js':url.pathname.includes('lucide')?'lucide.min.js':null;
    return route.fulfill({body:name?fs.readFileSync(path.join(qa,name)):'',contentType:'text/javascript'});
   }
   if(url.hostname==='127.0.0.1') return route.continue();
   return route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.__receiptReady);
  await page.evaluate(()=>{
   window.__receipts=Array.from({length:51},(_,i)=>({id:`10000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,
    printed_at:'2026-10-25T03:04:05Z',petugas:'ANANG RIDWAN',username:'14390.anang',idpel:`0014390${String(i).padStart(5,'0')}`,
    customer_name:i===0?'<script>window.__xss=true</script>':'PELANGGAN '+i,transaction_id:'000123'+i,reference:'REF-'+i,
    base_amount:100000,extra_amount:i%2?0:5000,admin_amount:5000,total_amount:105000+(i%2?0:5000),reprint_count:i===0?3:0}));
   state.user={id:'admin-test'}; state.profile={role:'admin'};
   state.supabaseClient={rpc:async(name,p)=>{
    if(name==='admin_receipt_monthly_summary') return {data:LPB_PETUGAS.map(r=>({petugas:r.biller,transaction_count:r.biller==='ANANG RIDWAN'?51:0,reprint_count:r.biller==='ANANG RIDWAN'?3:0,extra_income:r.biller==='ANANG RIDWAN'?130000:0}))};
    if(name==='get_receipt_snapshot') return {data:{print_text:'TOKO ASLI\n01/10/2026 10:04:05\nREF-0\nTOTAL Rp 110.000'}};
    let rows=window.__receipts.filter(r=>(!p.p_petugas||r.petugas===p.p_petugas)&&(!p.p_query||`${r.idpel} ${r.customer_name} ${r.reference}`.includes(p.p_query)));
    return {data:{rows:rows.slice(p.p_offset,p.p_offset+p.p_limit),total:rows.length}};
   }};
   document.getElementById('authGate').hidden=true;
   document.getElementById('appShell').hidden=false;
   document.getElementById('receiptHistoryMonth').value='2026-10';
   switchTab('receipt-history');
  });
  await page.waitForFunction(()=>document.querySelectorAll('#receiptHistoryDetails tr').length===50);
  assert.equal(await page.locator('#receiptHistorySummary tr').count(),17);
  assert.equal(await page.locator('#receiptHistoryOriginals').innerText(),'51');
  assert.match(await page.locator('#receiptHistoryIncome').innerText(),/130\.000/);
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  await page.screenshot({path:path.join(qa,'web-desktop.png'),fullPage:true});
  await page.locator('[data-receipt-id]').first().click();
  await page.locator('#receiptHistoryPreview').waitFor({state:'visible'});
  assert.match(await page.locator('#receiptHistoryPreviewText').innerText(),/REF-0/);
  await page.screenshot({path:path.join(qa,'web-snapshot.png')});
  await page.locator('#receiptHistoryClosePreview').click();
  await page.locator('#receiptHistoryNext').click();
  await page.waitForFunction(()=>document.querySelector('#receiptHistoryPage').textContent.startsWith('51-51'));
  await page.locator('#receiptHistorySearch').fill('REF-10');
  await page.waitForFunction(()=>document.querySelector('#receiptHistoryPage').textContent==='1-1 dari 1');
  await page.locator('#receiptHistoryPetugas').selectOption('ADRI');
  await page.waitForFunction(()=>document.querySelector('#receiptHistoryPage').textContent==='0 transaksi');
  await page.locator('#receiptHistoryPetugas').selectOption('');
  await page.locator('#receiptHistorySearch').fill('');
  await page.waitForFunction(()=>document.querySelector('#receiptHistoryPage').textContent==='1-50 dari 51');
  const download=page.waitForEvent('download');
  await page.locator('#receiptHistoryExport').click();
  await (await download).saveAs(path.join(qa,'riwayat-cetak-2026-10.xlsx'));
  const book=XLSX.read(fs.readFileSync(path.join(qa,'riwayat-cetak-2026-10.xlsx')),{type:'buffer'});
  assert.deepEqual(book.SheetNames,['Rekap Petugas','Detail Transaksi']);
  assert.equal(book.Sheets['Detail Transaksi'].D3.t,'s');
  assert.equal(book.Sheets['Detail Transaksi'].D3.v,'001439000000');
  assert.equal(book.Sheets['Detail Transaksi'].I4.v,0);
  assert.equal(book.Sheets['Rekap Petugas'].D20.v,130000);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>initializeMainMenu());
  await page.screenshot({path:path.join(qa,'web-mobile.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,'No full-page horizontal overflow on mobile');
  await page.evaluate(()=>{state.profile={role:'petugas'};updateOnlineUi();});
  await page.evaluate(()=>receiptHistoryController.load());
  assert.equal(await page.locator('#receiptHistoryOriginals').innerText(),'0');
  assert.deepEqual(errors,[]);
  console.log('PASS web UI: 17 staff, pagination, search, filter, safe snapshot, Excel file, mobile, account reset');
 } finally {if(browser) await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
