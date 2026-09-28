// Browser integration against a deterministic API fixture; SQL is tested separately.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const puppeteer=require(process.env.AKSIS_PUPPETEER_MODULE??'puppeteer');
const school='20000000-0000-4000-8000-000000000001',student='80000000-0000-4000-8000-000000000001',batch='70000000-0000-4000-8000-000000000001',card='81000000-0000-4000-8000-000000000001';
const schools=[{id:school,name:'Sekolah Uji SA',code:'TESTSA',timezone:'Asia/Makassar',status:'ACTIVE',is_active:true}];
const cards=[{id:card,school_id:school,student_id:student,card_serial:'AKS-001',qr_key:'a'.repeat(48),status:'BLOCKED',production_status:'DRAFT',print_snapshot:{school_name:'Sekolah Uji SA',student_name:'Andi Uji',student_number:'2026001',class_name:'X-A'}}];
const calls=[],unexpected=[],errors=[];
const browser=await puppeteer.launch({executablePath:process.env.AKSIS_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',async req=>{
 const u=new URL(req.url());if(!u.pathname.startsWith('/api/v1/'))return req.continue();
 const p=u.pathname.slice('/api/v1'.length),method=req.method(),body=req.postData()?JSON.parse(req.postData()):{};calls.push({p,method,body,headers:req.headers()});let data=[],status=200;
 if(p==='/auth/session')data={platform_admin:true,user:{email:'test@example.invalid'}};
 else if(p==='/platform/schools')data=schools;
 else if(p==='/platform/stats')data={total_schools:1,total_students:1,total_devices:0,total_cards:0};
 else if(p==='/platform/production/classes')data=[{id:'60000000-0000-4000-8000-000000000001',name:'X-A',academic_years:{name:'2026/27'}}];
 else if(p==='/platform/production/candidates')data=[{id:student,full_name:'Andi Uji',student_number:'2026001',student_cards:[]}];
 else if(p==='/platform/production/batches'&&method==='POST'){assert.deepEqual(body.student_ids,[student]);data={id:batch};}
 else if(p==='/platform/production/batches')data=[{id:batch,schools:{name:'Sekolah Uji SA'},template_version:'aksis-v1',created_at:new Date().toISOString()}];
 else if(p===`/platform/production/batches/${batch}`)data=cards;
 else if(p===`/platform/production/batches/${batch}/action`){cards[0].production_status=body.action==='RELEASED'?'READY_TO_WRITE':'PRINTED';data={accepted:true};}
 else if(p==='/platform/production/jobs')data=[{id:'job1',status:'QUEUED',attempt_count:0,max_attempts:3,student_cards:{print_snapshot:{student_name:'Andi Uji'}},schools:{name:'Sekolah Uji SA'}}];
 else if(p==='/platform/production/cards')data=[{...cards[0],students:{full_name:'Andi Uji'},schools:{name:'Sekolah Uji SA'}}];
 else if(p==='/platform/iam')data=[{id:'member1',user_id:'user1',status:'ACTIVE',users:{full_name:'Admin Uji'},schools:{name:'Sekolah Uji SA'},school_user_roles:[{roles:{code:'SCHOOL_ADMIN',role_permissions:[{permissions:{code:'student.read'}}]}}]}];
 else if(p==='/platform/devices')data=[{id:'device1',name:'Station Uji',device_type:'CARD_STATION',status:'ACTIVE',online:false,last_seen_at:null,schools:{name:'Sekolah Uji SA'}}];
 else if(p==='/platform/audit')data=[{id:'audit1',action:'CARD_BATCH_CREATED',occurred_at:new Date().toISOString(),schools:{name:'Sekolah Uji SA'},after_data:{count:1}}];
 else {unexpected.push(p);status=404;}
 await req.respond({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,meta:{page:1,page_size:30,total:Array.isArray(data)?data.length:1}})});
 });
 await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('aksis.admin.session',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh'}));});
 const base=process.env.AKSIS_ADMIN_URL??'http://127.0.0.1:4193';
 await page.goto(base+'/devices');await page.waitForFunction(()=>location.pathname==='/platform' && document.querySelectorAll('.stat-card').length===4).catch(async e=>{console.log({url:page.url(),calls:calls.map(c=>c.p),errors,body:await page.$eval('body',el=>el.innerText.slice(0,1200))});throw e;});
 assert.equal(await page.$('[data-action="switch-school"]'),null);assert.equal(await page.$('nav a[href="/devices"]'),null);assert.ok(await page.$('nav a[href="/platform-card-jobs"]'));
 assert.ok(!calls.some(c=>c.p.startsWith('/schools/current')));
 await page.goto(base+'/platform-card-jobs');await page.waitForSelector('[data-student]');await page.click('[data-student]');await page.click('[data-create]');await page.waitForSelector('.sa-preview .id-qr');
 assert.equal(await page.$eval('.id-person strong',el=>el.textContent),'Andi Uji');
 await page.screenshot({path:'/private/tmp/aksis-sa-production-preview.png',fullPage:true});
 const popupPromise=new Promise(resolve=>browser.once('targetcreated',async target=>resolve(await target.page())));await page.click('[data-print]');const popup=await popupPromise;await popup.waitForSelector('.id-card');assert.equal(await popup.$$eval('.id-qr',els=>els.length),1);await popup.emulateMediaType('print');await popup.pdf({path:'/private/tmp/aksis-sa-print-proof.pdf',preferCSSPageSize:true,printBackground:true});await popup.close();
 await page.click('[data-action="PRINTED"]');await page.waitForSelector('dialog[open]');await page.type('dialog textarea','Hasil cetak terbaca');await page.click('dialog input[type="checkbox"]');await page.click('dialog button.primary');await page.waitForFunction(()=>document.querySelector('.sa-card-previews')?.textContent.includes('PRINTED'));
 await page.click('[data-action="RELEASED"]');await page.waitForSelector('dialog[open]');await page.type('dialog textarea','QC QR selesai');await page.click('dialog input[type="checkbox"]');await page.click('dialog button.primary');await page.waitForFunction(()=>document.querySelector('.sa-card-previews')?.textContent.includes('READY_TO_WRITE'));assert.equal(await page.$eval('[data-print]',el=>el.disabled),true);
 for(const [path,text] of [['/platform-iam','Admin Uji'],['/platform-devices','Station Uji'],['/platform-audit','CARD_BATCH_CREATED'],['/platform-schools','Sekolah Uji SA']]){await page.goto(base+path);await page.waitForFunction(text=>document.querySelector('[data-content]')?.textContent.includes(text),{},text);}
 await page.setViewport({width:390,height:844});await page.goto(base+'/platform-card-jobs');await page.waitForSelector('[data-student]');await new Promise(resolve=>setTimeout(resolve,500));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile layout must not overflow viewport');await page.screenshot({path:'/private/tmp/aksis-sa-mobile.png',fullPage:true});
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert.ok(calls.some(c=>c.p.endsWith('/action')&&c.body.action==='RELEASED'));
 console.log('PASS: platform dashboard, batch selection, QR preview, printable PDF, print confirmation, release, IAM, devices, audit, schools, mobile; no browser errors.');
}finally{await browser.close();}
