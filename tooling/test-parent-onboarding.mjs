import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const output = process.env.AKSIS_PARENT_EVIDENCE || '/tmp/aksis-parent-onboarding-browser';
await fs.mkdir(output,{recursive:true});
const server = await createServer({configFile:'apps/parent-pwa/vite.config.ts',server:{port:4184,host:'127.0.0.1'}});
await server.listen();
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
let logged = false, fail = false; const payloads=[], errors=[];
try {
 const page=await browser.newPage();await page.setViewport({width:390,height:844});
 page.on('pageerror',error=>errors.push(error.message));await page.setRequestInterception(true);
 page.on('request',async req=>{
  const path=new URL(req.url()).pathname;if(!path.startsWith('/api/v1/'))return req.continue();
  let status=200,data;
  if(path.endsWith('/session/csrf')) {status=logged?200:401;data={csrf:'fixture-csrf'};}
  else if(path.endsWith('/session/context')) data={id:'guardian-a',user_id:'guardian-a',role_code:'PARENT',school_id:'',school_name:'Sekolah anak terhubung',metadata:{}};
  else if(path.endsWith('/session/enroll')) {payloads.push(JSON.parse(req.postData()));status=fail?422:201;logged=!fail;data={csrf:'fixture-csrf'};}
  else if(path.endsWith('/session/recover-qr')) {payloads.push(JSON.parse(req.postData()));logged=true;data={csrf:'fixture-csrf'};}
  else if(path.endsWith('/session/logout')) {logged=false;return req.respond({status:204});}
  else if(path.endsWith('/parent/profile')) data={full_name:'Nur Aisyah'};
  else if(path.endsWith('/parent/children')) data=[{student_id:'child-a',full_name:'Siswa Contoh',student_number:'0012345678',school_name:'Sekolah Contoh',class_name:'X A',relationship:'GUARDIAN'}];
  else if(path.endsWith('/today')) data={student_id:'child-a',timezone:'Asia/Makassar',profile:{full_name:'Siswa Contoh',first_name:'Siswa',school_name:'Sekolah Contoh',class_name:'X A',photo_url:null},attendance:{status:'BELUM_HADIR',check_in:'—',check_out:'—'},waste:{today_kg:0,today_points:0,total_points:0},library:{today_visits:0,month_visits:0},extracurricular:{name:'Tidak ada kegiatan hari ini',status:'TIDAK_ADA',time_attended:'—'},events:[]};
  else {errors.push(`Unexpected API ${path}`);status=404;}
  await req.respond({status,contentType:'application/json',body:JSON.stringify({success:status<400,data,error:{code:'PARENT_LINK_INVALID',message:'QR atau data anak tidak sesuai.'}})});
 });
 const base='http://127.0.0.1:4184/';
 await page.goto(base);await page.waitForFunction(()=>document.body.textContent.includes('Pindai QR Portal'));
 assert.equal(await page.$('input[type=email]'),null);assert.equal(await page.$('input[type=password]'),null);
 await page.goto(base+'#token='+'a'.repeat(64));await page.reload();await page.waitForSelector('#parent-login');
 assert.equal(new URL(page.url()).hash,'');
 for(const width of [320,390,768]){
  await page.setViewport({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  await page.screenshot({path:`${output}/enrollment-${width}.png`,fullPage:true});
 }
 await page.type('[name=nisn]','0012345678');await page.$eval('[name=date_of_birth]',e=>e.value='2010-01-02');await page.type('[name=full_name]','Nur Aisyah');await page.type('[name=phone]','081234567890');
 fail=true;await page.$eval('#parent-login',e=>e.requestSubmit());await page.waitForFunction(()=>document.getElementById('auth-message')?.textContent==='QR atau data anak tidak sesuai.');
 assert.equal(await page.$eval('#parent-login button',e=>e.disabled),false);
 fail=false;await page.$eval('#parent-login',e=>e.requestSubmit());await page.waitForSelector('.parent-grid');
 assert.equal(payloads[1].token,'a'.repeat(64));assert.equal(payloads[1].nisn,'0012345678');assert.equal(payloads[1].full_name,'Nur Aisyah');
 assert.equal(await page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('a'.repeat(64)))),false);
 await page.screenshot({path:`${output}/dashboard.png`,fullPage:true});
 await page.reload();await page.waitForSelector('.parent-grid');
 await page.evaluate(()=>document.querySelector('dialog[open]')?.close());await page.click('#nav-profile');await page.waitForSelector('.profile-card');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Keluar').click());
 await page.waitForFunction(()=>document.body.textContent.includes('Pindai QR Portal'));
 await page.goto(base+'#parent_recovery='+'b'.repeat(64));await page.reload();await page.waitForSelector('.parent-grid');
 assert.equal(new URL(page.url()).hash,'');assert.equal(payloads.at(-1).token,'b'.repeat(64));
 assert.equal(await page.evaluate(()=>localStorage.getItem('aksis.parent.locked')),null);
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/results.json`,JSON.stringify({passed:true,viewports:[320,390,768],cases:['QR school form','no email or password','input retains NISN zeros','failed enrollment retry','successful enrollment','session restore','logout','personal recovery after logout','URL secret removal','no QR in localStorage']},null,2));
 console.log('PASS: school QR enrollment, isolated session UI, recovery, errors and 3 responsive viewports');
}finally{await browser.close();await server.close();}
