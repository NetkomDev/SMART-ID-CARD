import assert from'node:assert/strict';import{createServer}from'vite';import puppeteer from'puppeteer-core';import{mkdir,writeFile}from'node:fs/promises';
const output=process.env.AKSIS_SCANNER_EVIDENCE||'/tmp/aksis-pwa-scanners';await mkdir(output,{recursive:true});
const fake=`export const Html5QrcodeSupportedFormats={QR_CODE:0};export class Html5Qrcode{constructor(id){this.id=id;window.qrReaders??=[];window.qrReaders.push(this);}async start(_facing,config,callback){this.callback=callback;window.qrBox=config.qrbox(240,240);await new Promise(r=>setTimeout(r,window.cameraDelay||5));if(window.cameraFailure)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});const video=document.createElement('video');video.style.cssText='width:100%;height:100%';document.getElementById(this.id).append(video);window.activeCameras=(window.activeCameras||0)+1;}async stop(){document.getElementById(this.id).replaceChildren();window.activeCameras=Math.max(0,(window.activeCameras||0)-1);}}`;
const apps=[['waste-pwa','WASTE_STAFF',4191],['library-terminal','LIBRARY_STAFF',4192],['extracurricular-pwa','TEACHER',4193]];
const results=[];const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const[app,role,port]of apps){
 const server=await createServer({configFile:`apps/${app}/vite.config.ts`,server:{host:'127.0.0.1',port,strictPort:true},optimizeDeps:{exclude:['html5-qrcode']},plugins:[{name:'qr-fixture',enforce:'pre',resolveId(source){if(source==='html5-qrcode')return'\0qr-fixture';},load(id){if(id==='\0qr-fixture')return fake;}}]});await server.listen();
 const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.setViewport({width:390,height:844});const errors=[],writes=[];let reject=false,offline=false,needsEnrollment=false;
 const activity='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';const student={id:'11111111-1111-4111-8111-111111111111',full_name:'Siswa Uji Kamera',nisn:'0012345678',student_number:'1001',photo_url:null};const context={id:'portal-a',school_id:'school-a',school_name:'SMA Negeri 3 Watampone',role_code:role,metadata:role==='WASTE_STAFF'?{class_id:'class-a'}:{}};
 try{
 page.on('pageerror',e=>errors.push(e.message));await page.evaluateOnNewDocument((role,context,activity)=>{localStorage.setItem(`aksis.portal.${role}.v1`,JSON.stringify({session:{access_token:'fixture',refresh_token:'fixture'},portal:context}));localStorage.setItem('aksis_last_ekskul_id',activity);localStorage.setItem('aksis_last_ekskul_name','Bola Basket');},role,context,activity);
 await page.setRequestInterception(true);page.on('request',async req=>{const u=new URL(req.url()),p=u.pathname;if(!p.startsWith('/api/v1/'))return req.continue();let data=[],status=200;
 if(p.endsWith('/auth/qr/context'))data=context;
 else if(p.includes('/classes/'))data={id:'class-a',name:'X A'};
 else if(p.endsWith('/waste/dashboard'))data={school_id:'school-a',period:u.searchParams.get('period'),timezone:'Asia/Makassar',as_of:new Date().toISOString(),rates:{organic:7.5,inorganic:10},today:{students:0,total_kg:0,points:0,transactions:0,unscored:0},classes:[],top_students:[],bottom_students:[]};
 else if(p.endsWith('/students/resolve'))data=student;
 else if(p.endsWith('/waste/transactions')){writes.push(JSON.parse(req.postData()));data={total_kg:.5,points_earned:3.75};}
 else if(p.endsWith('/library/visits')){writes.push(JSON.parse(req.postData()));data={student_name:student.full_name,class_name:'X A',duplicate:false};if(offline){offline=false;return req.abort('failed');}if(reject)status=403;}
 else if(p.endsWith('/library/summary'))data=[];
 else if(p.endsWith('/extracurriculars'))data=[{id:activity,name:'Bola Basket',code:'BASKET',is_active:true}];
 else if(p.endsWith('/sessions'))data=[{id:session,status:'OPEN',starts_at:new Date().toISOString()}];
 else if(p.endsWith('/summary'))data={total:0,present:0,excused:0,absent:0};
 else if(p.endsWith('/scan')){writes.push(JSON.parse(req.postData()));data={student,needs_enrollment:needsEnrollment,attendance:{id:'record-a'}};if(reject)status=500;}
 else if(p.endsWith('/fast-enroll')||p.endsWith('/attendance')){if(req.method()==='POST')writes.push(JSON.parse(req.postData()));data={};}
 await new Promise(r=>setTimeout(r,80));await req.respond({status,contentType:'application/json',body:JSON.stringify({success:status<400,data,error:{message:'Pencatatan ditolak server',code:'FORBIDDEN'}})});
 });
 await page.goto(`http://127.0.0.1:${port}/`);await page.waitForSelector('#btn-toggle-camera',{visible:true});await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 const geometry=[];
 for(const[width,height]of[[320,568],[360,740],[390,844],[430,932],[768,1024],[844,390]]){
 await page.setViewport({width,height});await new Promise(r=>setTimeout(r,100));const g=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return{width:innerWidth,pageWidth:document.documentElement.scrollWidth,stage:r('.scanner-stage'),viewport:r('.scanner-viewport'),button:r('#btn-toggle-camera'),state:r('.scan-state')};});geometry.push(g);await page.screenshot({path:`${output}/${app}-${width}-off.png`,fullPage:true});assert(g.pageWidth<=width,`${app} page overflow at ${width}: ${g.pageWidth}`);assert(g.button.top>=g.viewport.bottom-1,`${app} controls overlap camera`);assert(g.state.top>=g.button.bottom-1,`${app} status overlaps button`);
 }
 await page.setViewport({width:390,height:844});await page.click('#btn-toggle-camera');await page.waitForFunction(()=>document.querySelector('#scanner-stage').dataset.cameraState==='active');await page.screenshot({path:`${output}/${app}-active.png`,fullPage:true});assert(await page.evaluate(()=>window.qrBox.width<240));
 await page.click('#btn-switch-camera');await page.waitForFunction(()=>document.querySelector('#scanner-stage').dataset.cameraState==='active'&&window.activeCameras===1);
 // Two simultaneous decode callbacks must not produce two identity/transaction operations.
 await page.evaluate(()=>{const reader=window.qrReaders.filter(r=>r.id==='qr-reader').at(-1);reader.callback('0012345678');reader.callback('0012345678');});
 if(app==='waste-pwa'){
 await page.waitForSelector('#view-input',{visible:true});assert.equal(await page.evaluate(()=>window.activeCameras),0);await page.$eval('#form-input',f=>f.requestSubmit());await page.waitForSelector('#view-success',{visible:true});assert.equal(writes.length,1);assert(writes[0].event_id);await page.click('#btn-next-scan');
 }else if(app==='library-terminal'){
 await page.waitForSelector('#view-success',{visible:true});assert.equal(writes.length,1);await page.click('#btn-next-scan');reject=true;
 await page.$eval('#card',e=>e.value='0012345679');await page.$eval('#scan',f=>f.requestSubmit());await page.waitForFunction(()=>document.getElementById('status').value.includes('ditolak'));assert.equal(await page.$eval('#view-success',e=>getComputedStyle(e).display),'none','failed write cannot show success');reject=false;offline=true;
 await page.$eval('#card',e=>e.value='0012345680');await page.$eval('#scan',f=>f.requestSubmit());await page.waitForFunction(()=>document.getElementById('status').value.includes('tertunda'));const queuedId=writes.at(-1).event_id;await page.click('#sync');await page.waitForFunction(()=>document.getElementById('queued').textContent==='0');assert.equal(writes.at(-1).event_id,queuedId,'offline retry preserves event ID');
 }else{
 await page.waitForSelector('#success-overlay',{visible:true});assert.equal(writes.length,1);await page.click('#btn-next-scan');reject=true;
 await page.$eval('#scan-input',e=>e.value='0012345679');await page.$eval('#form-scan',f=>f.requestSubmit());await page.waitForSelector('#error-overlay',{visible:true});assert.equal(await page.$eval('#success-overlay',e=>getComputedStyle(e).display),'none','failed attendance cannot show success');await page.$eval('#error-overlay',e=>e.style.display='none');reject=false;needsEnrollment=true;
 await page.$eval('#scan-input',e=>e.value='0012345680');await page.$eval('#form-scan',f=>f.requestSubmit());await page.waitForSelector('#enrollment-overlay',{visible:true});assert.equal(writes.at(-1).identity,'0012345680');await page.click('#btn-cancel-enroll');
 }
 // A hidden page always releases camera ownership; denied permissions keep manual input usable.
 if(await page.$eval('#scanner-stage',e=>e.dataset.cameraState)!=='active')await page.click('#btn-toggle-camera');await page.waitForFunction(()=>document.querySelector('#scanner-stage').dataset.cameraState==='active');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.activeCameras===0);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});window.cameraFailure=true;});await page.click('#btn-toggle-camera');await page.waitForFunction(()=>document.querySelector('#scanner-stage').dataset.cameraState==='error');assert.equal(await page.evaluate(()=>window.activeCameras),0);assert.equal(await page.$eval('#btn-toggle-camera',e=>e.disabled),false);
 assert.deepEqual(errors,[]);results.push({app,result:'PASS',geometry,writes:writes.length,cases:['6 viewports','camera controls outside preview','adaptive scan box','camera flip','duplicate frame suppression','server-confirmed transaction','hidden page stops camera','permission denied leaves manual fallback']});
 }finally{await page.close();await server.close();}
}await writeFile(`${output}/results.json`,JSON.stringify({result:'PASS',apps:results},null,2));console.log('PASS: all 3 PWA scanners; 18 viewport cases; camera lifecycle and confirmed transaction flows');}finally{await browser.close();}
