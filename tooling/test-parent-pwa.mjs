import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.AKSIS_PUPPETEER_MODULE ?? 'puppeteer');
const browser = await puppeteer.launch({ executablePath: process.env.AKSIS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.AKSIS_PARENT_URL ?? 'http://127.0.0.1:4174/';
try {
 const page = await browser.newPage();
 const errors = [], unexpected = [];
 let empty = false, legacy = false, valid = true, fails = false, linked = true;
 const portal = { id:'portal1', school_id:'school1', school_name:'SMA Negeri 3 Watampone', role_code:'PARENT', metadata:{} };
 const today = () => ({ student_id:'child1', timezone:'Asia/Makassar', as_of:'2026-09-28T08:00:00Z',
  profile:{full_name:'Andi Muhammad Asyraaf',first_name:'Andi',school_name:portal.school_name,class_name:'Kelas X-2',photo_url:null},
  attendance:{status:empty?'BELUM_HADIR':'HADIR',check_in:empty?'—':'06.54',check_out:empty?'—':'15.20'},
  waste:{total_points:empty?0:18,today_kg:empty?0:2.4,today_points:empty?0:18},
  library:{today_visits:empty?0:1,month_visits:empty?0:7},
  extracurricular:{name:empty?'Tidak ada kegiatan hari ini':'Bola Basket',status:empty?'TIDAK_ADA':'HADIR',time_attended:empty?'—':'15.30',schedule:empty?null:'15.30 – 17.00'},
  events:empty?[]:[{id:'ev1',type:'attendance.check_in',occurred_at:'2026-09-27T22:54:00Z',is_late:false},{id:'ev2',type:'library.visit',occurred_at:'2026-09-28T02:00:00Z',is_late:false,extra_info:'Kunjungan Perpustakaan'}]
 });
 page.on('pageerror', error => errors.push(error.message));
 await page.setRequestInterception(true);
 page.on('request', async req => {
  const path = new URL(req.url()).pathname;
  if (!path.startsWith('/api/v1/')) return req.continue();
  let data, status = 200;
  if(path.endsWith('/auth/qr/login') || path.endsWith('/auth/qr/context')) { if (!valid) status=403; else data=path.endsWith('/login')?{session:{access_token:'fixture',refresh_token:'fixture'},portal}:portal; }
  else if(path.endsWith('/parent/children')) data=linked?[{student_id:'child1',full_name:'Andi Muhammad Asyraaf',school_name:portal.school_name,class_name:'Kelas X-2'},{student_id:'child2',full_name:'Nadia Putri',school_name:portal.school_name,class_name:'Kelas VII B'}]:[];
  else if(path.endsWith('/today')) { if(fails)status=503;data=legacy?{timezone:'Asia/Makassar',events:[]}:today();if(path.includes('child2')&&!legacy)data.profile={...data.profile,full_name:'Nadia Putri',first_name:'Nadia'}; }
  else if(path.endsWith('/parent/link')) {linked=true;data={link_id:'child1'};}
  else if(path.endsWith('/auth/logout')) {await req.respond({status:204});return;}
  else { unexpected.push(path);status=404; }
  await req.respond({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,error:{code:valid?'UNAVAILABLE':'PORTAL_ACCESS_INVALID',message:valid?'Data sementara tidak tersedia':'QR dinonaktifkan'}})});
 });
 await page.setViewport({width:390,height:844});
 await page.goto(base); await page.waitForSelector('.portal-gate');
 await page.goto(base+'#token='+'a'.repeat(64));await page.reload();
 await page.waitForSelector('.parent-grid');
 await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 for (const width of [320,390,680,1366]) {
  await page.setViewport({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);
  await page.screenshot({path:`/private/tmp/parent-dashboard-${width}.png`,fullPage:true});
 }
 await page.setViewport({width:390,height:844});
 await page.focus('#card-library');await page.keyboard.press('Enter');
 await page.waitForSelector('#timeline-drawer[open]');
 assert.ok(await page.$eval('.timeline-content',e=>e.textContent.includes('Perpustakaan')&&!e.textContent.includes('Tiba di sekolah')));
 await page.keyboard.press('Escape');
 assert.equal(await page.$eval('#timeline-drawer',e=>e.open),false);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'card-library');
 await page.select('#child-picker','child2');await page.waitForFunction(()=>document.querySelector('.student-details h2')?.textContent==='Nadia Putri');
 await page.click('#nav-profile');await page.waitForSelector('.profile-card');await page.click('#nav-home');await page.waitForSelector('.parent-grid');
 empty=true;await page.click('#refresh-dashboard');await page.waitForFunction(()=>document.querySelector('.donut-val')?.textContent==='0');
 assert.ok(!(await page.$eval('.parent-grid',e=>e.textContent)).includes('15.30'));
 assert.ok(!(await page.$eval('.parent-grid',e=>e.textContent)).includes('Bola Basket'));
 legacy=true;await page.click('#refresh-dashboard');await page.waitForFunction(()=>document.querySelector('.donut-val')?.textContent==='—');
 assert.ok((await page.$eval('.stat-sub',e=>e.textContent)).includes('—'));
 fails=true;await page.click('#refresh-dashboard');await page.waitForSelector('#retry-portal',{visible:true});
 fails=false;legacy=false;await page.click('#retry-portal');await page.waitForSelector('.parent-grid');
 linked=false;await page.reload();await page.waitForSelector('#link-child-btn');await page.click('#link-child-btn');
 await page.type('input[name=name]','Orang Tua');await page.type('input[name=nisn]','1234567890');
 await page.$eval('input[name=dob]',e=>e.value='2010-01-01');await page.$eval('#link-form',e=>e.requestSubmit());await page.waitForSelector('.parent-grid');
 await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 valid=false;await page.reload();await page.waitForSelector('.portal-gate');
 await page.waitForFunction(()=>document.body.textContent.includes('QR dinonaktifkan'));
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('PASS: parent QR gate, responsive layouts, keyboard dialogs, child switching, linking, empty/legacy/error states and revoked access');
} finally { await browser.close(); }
