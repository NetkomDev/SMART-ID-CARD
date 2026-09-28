import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), puppeteer=require(process.env.AKSIS_PUPPETEER_MODULE??'puppeteer');
const browser=await puppeteer.launch({executablePath:process.env.AKSIS_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const portals=[['parent','PARENT',4290,'.welcome'],['waste','WASTE_STAFF',4291,'#view-scan'],['extracurricular','TEACHER',4292,'#view-dashboard'],['library','LIBRARY_STAFF',4293,'#panel']];
try {
 for(const [name,role,port,ready] of portals){
 const page=await browser.newPage();await page.setViewport({width:390,height:844});const errors=[],unexpected=[],calls=[];let valid=true;
 const portal={id:'portal1',school_id:'school1',school_name:'SMA Negeri 3 Watampone',role_code:role,metadata:{class_id:'class1'}};
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',async req=>{const url=new URL(req.url());if(!url.pathname.startsWith('/api/v1/'))return req.continue();const path=url.pathname.slice(7);calls.push(path);let data,status=200;
 if(path==='/auth/qr/login'||path==='/auth/qr/context') {if(!valid){status=401;data=null;}else data=path.endsWith('/login')?{session:{access_token:'fixture',refresh_token:'fixture-refresh'},portal}:portal;}
 else if(path==='/classes/class1')data={name:'X IPA 1'};
 else if(path==='/parent/children')data=[{student_id:'child1',full_name:'Andi Pratama',class_name:'X IPA 1',school_name:portal.school_name},{student_id:'child2',full_name:'Nadia Putri',class_name:'VII B',school_name:portal.school_name}];
 else if(path.endsWith('/today'))data={timezone:'Asia/Makassar',events:[{type:'attendance.check_in',occurred_at:new Date().toISOString(),is_late:false},{type:'library.visit',occurred_at:new Date().toISOString(),extra_info:'Kunjungan perpustakaan'}]};
 else if(path==='/extracurriculars')data=[{id:'activity1',code:'PRM',name:'Pramuka'},{id:'activity2',code:'BSK',name:'Bola basket'}];
 else if(path.endsWith('/sessions'))data=[{id:'session1',starts_at:new Date().toISOString()}];
 else if(path==='/cards/resolve')data={id:'child1',full_name:'Andi Pratama',student_number:'2026001'};
 else if(path==='/waste/transactions')data={id:'transaction1'};
 else if(path==='/library/visits')data={student_name:'Andi Pratama'};
 else if(path==='/auth/logout'){await req.respond({status:204});return;}
 else{unexpected.push(path);status=404;}
 await req.respond({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,error:status===401?{code:'PORTAL_ACCESS_INVALID',message:'QR sudah dinonaktifkan Admin Sekolah.'}:undefined})});});
 const base=`http://127.0.0.1:${port}/`;await page.goto(base);await page.waitForSelector('.portal-gate',{visible:true});assert.equal(calls.length,0,'Bare URL must not request tenant data');
 await page.screenshot({path:`/private/tmp/aksis-${name}-gate.png`,fullPage:true});
 valid=false;await page.goto(base+'#token='+'b'.repeat(64));await page.reload();await page.waitForFunction(()=>document.body.textContent.includes('QR sudah dinonaktifkan'));assert.ok(calls.every(p=>p==='/auth/qr/login'));
 valid=true;await page.goto(base+'#token='+'a'.repeat(64));await page.reload();await page.waitForSelector(ready,{visible:true});await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 await page.screenshot({path:`/private/tmp/aksis-${name}-mobile.png`,fullPage:true});
 assert.ok(!page.url().includes('token='));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile must not overflow');
 await page.screenshot({path:`/private/tmp/aksis-${name}-mobile.png`,fullPage:true});
 if(name==='parent'){await page.select('#child-picker','child2');await page.waitForFunction(()=>document.querySelector('.welcome h1')?.textContent==='Nadia Putri');await page.click('#profile');await page.waitForSelector('.profile-card');await page.click('#home');await page.waitForSelector('.welcome');}
 if(name==='waste'){await page.type('#scan-input','a'.repeat(48));await page.$eval('#form-scan',f=>f.requestSubmit());await page.waitForSelector('#view-input',{visible:true});await page.$eval('#form-input',f=>f.requestSubmit());await page.waitForSelector('#view-success',{visible:true});}
 if(name==='extracurricular'){await page.click('#ekskul-list button');await page.waitForSelector('#view-scan',{visible:true});await page.evaluate(()=>document.querySelector('dialog[open]')?.close());}
 if(name==='library'){await page.type('#card','a'.repeat(48));await page.$eval('#scan',f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Andi'));}
 await page.setViewport({width:1366,height:900});await page.screenshot({path:`/private/tmp/aksis-${name}-desktop.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 valid=false;await page.reload();await page.waitForSelector('.portal-gate',{visible:true});await page.waitForFunction(()=>document.body.textContent.includes('QR sudah dinonaktifkan'));assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${name}: QR gate, invalid/revoked access, authenticated flow, mobile and desktop`);await page.close();
 }
}finally{await browser.close();}
