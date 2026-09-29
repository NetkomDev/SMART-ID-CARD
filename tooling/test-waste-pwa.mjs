import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.AKSIS_PUPPETEER_MODULE ?? 'puppeteer');
const browser = await puppeteer.launch({ executablePath: process.env.AKSIS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.AKSIS_WASTE_URL ?? 'http://127.0.0.1:4175/';
const school = { id: 'portal1', school_id: 'school1', school_name: 'SMA Negeri 3 Watampone', role_code: 'WASTE_STAFF', metadata: { class_id: 'class1' } };
const data = period => ({ school_id: 'school1', period, timezone:'Asia/Makassar', as_of:'2026-09-28T08:00:00Z', rates:{organic:7.5,inorganic:10}, today:{students:24,total_kg:38.6,points:312,transactions:25,unscored:0}, classes:[{class_id:'c1',class_name:'X-2',total_kg:42.4,student_count:24},{class_id:'c2',class_name:'XI-1',total_kg:31.6,student_count:19},{class_id:'c3',class_name:'XII-3',total_kg:24,student_count:12}], top_students:[{student_id:'s1',full_name:'Andi Muhammad Asyraaf',class_name:'X-2',total_kg:8.4},{student_id:'s2',full_name:'Siti Nurhaliza',class_name:'XI-1',total_kg:7.2},{student_id:'s3',full_name:'Muhammad Fajar',class_name:'XII-3',total_kg:6.8}], bottom_students:[{student_id:'s4',full_name:'Nadia Putri',class_name:'XI-1',total_kg:0},{student_id:'s5',full_name:'Rizky Ramadhan',class_name:'X-2',total_kg:.2},{student_id:'s6',full_name:'Dewi Lestari',class_name:'XII-3',total_kg:.3}] });
try {
 const page = await browser.newPage(); await page.setViewport({width:390,height:844});
 const errors=[], unexpected=[], deposits=[]; let valid=true, dashboardFails=false, empty=false, loseResponse=true, wrongSchool=false, unscored=false;
 page.on('pageerror', e=>errors.push(e.message)); await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url()); if(!url.pathname.startsWith('/api/v1/')) return req.continue();
  const path=url.pathname.slice(7); let body,status=200;
  if(path==='/auth/qr/login'||path==='/auth/qr/context'){if(!valid){status=401;}else body=path.endsWith('/login')?{session:{access_token:'fixture',refresh_token:'refresh'},portal:school}:school;}
  else if(path==='/classes/class1')body={name:'X-2'};
  else if(path==='/waste/dashboard') {if(dashboardFails)status=503; else {body=data(url.searchParams.get('period'));if(wrongSchool)body.school_id='school-other';if(unscored){body.today.points=0;body.today.unscored=body.today.transactions;}if(empty){body.classes=[];body.top_students=[];body.bottom_students=[];}}}
  else if(path==='/cards/resolve')body={id:'child1',full_name:'Andi Muhammad Asyraaf',student_number:'2026001'};
  else if(path==='/waste/transactions'){deposits.push(JSON.parse(req.postData()));if(loseResponse){loseResponse=false;return req.abort('failed');}body={id:'transaction1',total_kg:2.4,points_earned:18};}
  else if(path==='/auth/logout'){await req.respond({status:204});return;}
  else {unexpected.push(path);status=404;}
  await req.respond({status,contentType:'application/json',body:JSON.stringify({success:status===200,data:body,error:status===401?{code:'PORTAL_ACCESS_INVALID',message:'QR sudah dinonaktifkan.'}:{message:'Layanan sementara tidak tersedia.'}})});
 });
 await page.goto(base);await page.waitForSelector('.portal-gate',{visible:true});
 assert.equal(await page.$eval('#workspace-nav',e=>e.hidden),true);
 await page.goto(base+'#token='+'a'.repeat(64));await page.reload();await page.waitForSelector('#view-scan',{visible:true});
 await page.waitForFunction(()=>document.querySelector('#today-weight').textContent.includes('38,6'));
 assert.equal(await page.$eval('#today-panel',e=>e.hidden),true);
 assert.equal(await page.$('.brand b'),null);
 await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 await page.screenshot({path:'/private/tmp/waste-scan-mobile.png',fullPage:true});
 await page.type('#scan-input','a'.repeat(48));await page.$eval('#form-scan',f=>f.requestSubmit());
 await page.waitForSelector('#view-input',{visible:true});
 await page.$eval('#weight-input',e=>{e.value='2.4';e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.$eval('#points-preview',e=>e.textContent),'18 poin');
 await page.click('input[value="INORGANIC"] + span');assert.equal(await page.$eval('#points-preview',e=>e.textContent),'24 poin');
 await page.click('input[value="ORGANIC"] + span');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/private/tmp/waste-input-mobile.png',fullPage:true});
 await page.$eval('#form-input',f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('#input-error').textContent.includes('tanpa menggandakan'));
 assert.equal(await page.$eval('#weight-input',e=>e.disabled),true);
 await page.reload();await page.waitForSelector('#view-input',{visible:true});
 await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 assert.equal(await page.$eval('#weight-input',e=>e.disabled),true);
 assert.equal(await page.$eval('#weight-input',e=>e.value),'2.4');
 await page.$eval('#form-input',f=>{f.requestSubmit();f.requestSubmit();});await page.waitForSelector('#view-success',{visible:true});
 assert.equal(deposits.length,2);assert.deepEqual(deposits[0],deposits[1]);
 await page.click('#btn-ranking');await page.waitForSelector('#view-ranking',{visible:true});
 await page.waitForFunction(()=>document.querySelectorAll('#top-students li').length===3);
 assert.equal(await page.$eval('#today-panel',e=>e.hidden),false);
 assert.equal(await page.$eval('#today-scope',e=>e.textContent),'Semua kelas di SMA Negeri 3 Watampone');
 await page.select('#ranking-period','all');await page.waitForFunction(()=>document.querySelector('#period-caption').textContent==='Semua waktu');
 assert.equal(await page.$eval('#today-weight',e=>e.textContent),'38,6 kg');
 unscored=true;await page.click('#btn-refresh');await page.waitForFunction(()=>document.querySelector('#today-points-label').textContent.includes('25 setoran'));
 assert.equal(await page.$eval('#today-points',e=>e.textContent),'—');
 unscored=false;await page.click('#btn-refresh');await page.waitForFunction(()=>document.querySelector('#today-points').textContent==='312 poin');
 assert.ok(await page.evaluate(()=>document.querySelector('#today-panel').getBoundingClientRect().top<document.querySelector('#class-ranking').getBoundingClientRect().top));
 assert.equal(await page.$$eval('#class-ranking li',rows=>rows.length),3);
 assert.equal(await page.$eval('#class-ranking li:first-child strong',e=>e.textContent),'X-2');
 assert.ok(await page.$eval('#bottom-students',e=>e.textContent.includes('Belum menyetor')));
 assert.equal(await page.$eval('#period-weight',e=>e.textContent),'98 kg');
 assert.equal(await page.$eval('#participating-classes',e=>e.textContent),'3 / 3 kelas');
 assert.ok(await page.$eval('#contribution-donut',e=>e.style.background.includes('conic-gradient')));
 assert.equal(await page.$eval('#top-students .rank-bar i',e=>e.style.width),'100%');
 assert.equal(await page.$eval('#bottom-students .rank-bar i',e=>e.style.width),'0%');
 for(const width of [320,390,768]) {
  await page.setViewport({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Ranking overflow at ${width}px`);
 }
 await page.setViewport({width:390,height:844});
 await page.screenshot({path:'/private/tmp/waste-ranking-mobile.png',fullPage:true});
 await page.setViewport({width:1440,height:1000});await page.screenshot({path:'/private/tmp/waste-ranking-desktop.png',fullPage:true});
 await page.click('#btn-fullscreen');await page.waitForFunction(()=>Boolean(document.fullscreenElement));
 assert.ok(await page.evaluate(()=>document.querySelector('#bottom-students').getBoundingClientRect().bottom<innerHeight),'Fullscreen must fit both student panels');
 await page.click('#btn-fullscreen');await page.waitForFunction(()=>!document.fullscreenElement);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 dashboardFails=true;await page.select('#ranking-period','today');await page.waitForFunction(()=>document.querySelector('#ranking-error').textContent.includes('belum diperbarui'));
 assert.equal(await page.$eval('#ranking-content',e=>e.hidden),true);
 assert.equal(await page.$eval('#today-weight',e=>e.textContent),'—');
 assert.equal(await page.$eval('#today-date',e=>e.textContent),'');
 dashboardFails=false;empty=true;await page.click('#btn-refresh');await page.waitForFunction(()=>document.querySelector('#top-students').textContent.includes('Belum ada setoran'));
 assert.equal(await page.$eval('#period-weight',e=>e.textContent),'0 kg');
 assert.equal(await page.$eval('#participating-classes',e=>e.textContent),'0 / 0 kelas');
 assert.ok(await page.$eval('#contribution-donut',e=>e.getAttribute('aria-label').includes('Belum ada setoran')));
 empty=false;await page.click('#btn-refresh');await page.waitForFunction(()=>document.querySelectorAll('#top-students li').length===3);
 await page.click('#btn-deposit');await page.waitForSelector('#view-scan',{visible:true});assert.equal(await page.$eval('#view-input',e=>getComputedStyle(e).display),'none');
 wrongSchool=true;await page.click('#btn-ranking');await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('Konteks sekolah'));
 assert.equal(await page.$eval('#today-weight',e=>e.textContent),'—');
 wrongSchool=false;await page.reload();await page.waitForSelector('#view-scan',{visible:true});
 valid=false;await page.reload();await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('dinonaktifkan'));
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('PASS waste PWA: QR access, weight/points, lost response and duplicate clicks, rankings, failed/empty periods, responsive layout, revoked access');
} finally { await browser.close(); }
