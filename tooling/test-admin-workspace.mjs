import assert from 'node:assert/strict';import{createServer}from'vite';import puppeteer from'puppeteer-core';import{mkdir,writeFile}from'node:fs/promises';
const output=process.env.AKSIS_ADMIN_EVIDENCE||'/tmp/aksis-admin-workspace';await mkdir(output,{recursive:true});
const server=process.env.AKSIS_ADMIN_BASE_URL?null:await createServer({configFile:'apps/admin-web/vite.config.ts',server:{host:'127.0.0.1',port:4196,strictPort:true}});if(server)await server.listen();
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const rows=[{id:'11111111-1111-4111-8111-111111111111',student_number:'1001',nisn:'0012345678',full_name:'Andi Muhammad Asyraaf',class_name:'X A',date_of_birth:'2010-01-02',gender:'MALE',pob:'Watampone',address:'Jalan Pendidikan No. 45, Kabupaten Bone, Sulawesi Selatan',is_active:true},{id:'22222222-2222-4222-8222-222222222222',student_number:'1002',nisn:'0012345679',full_name:'Nur Aisyah Dahlan',class_name:'X A',gender:'FEMALE',is_active:true}];
const classes=Array.from({length:12},(_,i)=>({id:`class-${i}`,code:`X${i}`,name:`${i<3?'X':i<6?'XI':'XII'} ${String.fromCharCode(65+i%3)}`,grade_level:10+Math.floor(i/4),student_count:i===0?2:0}));
const school={id:'school-a',code:'SMAN3WTP',name:'SMA Negeri 3 Watampone',timezone:'Asia/Makassar',context:{school_id:'school-a',membership_id:'member-a',roles:['SCHOOL_ADMIN'],permissions:[]}};
const errors=[],requests=[],geometry=[],timings=[],spreadsheets=[];let delay=100;
try{
 const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.setViewport({width:1440,height:900});page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('aksis-theme','light');sessionStorage.setItem('aksis.admin.session',JSON.stringify({access_token:'fixture',refresh_token:'fixture'}));sessionStorage.setItem('aksis.admin.school','school-a');});
 await page.setRequestInterception(true);page.on('request',async req=>{
 const url=new URL(req.url()),p=url.pathname;if(p.includes('xlsx')&&/\.(js|mjs)$/.test(p))spreadsheets.push(p);if(!p.startsWith('/api/v1/'))return req.continue();requests.push(p+url.search);let data=[];
 if(p.endsWith('/auth/session'))data={platform_admin:false,user:{email:'admin@sekolah.example'}};
 else if(p.endsWith('/schools/current'))data=school;
 else if(p.endsWith('/classes/summary'))data=classes;
 else if(p.endsWith('/students')&&req.method()==='GET')data=url.searchParams.get('search')==='AAA'?rows.slice(0,1):url.searchParams.get('search')==='BBB'?rows.slice(1):rows;
 else if(p.match(/\/students\/[^/]+$/)&&req.method()==='PATCH'){Object.assign(rows[0],JSON.parse(req.postData()));data=rows[0];}
 else if(p.endsWith('/academic-years'))data=[{id:'year-a',name:'2026/2027',start_date:'2026-07-01',end_date:'2027-06-30',is_active:true}];
 else if(p.endsWith('/cards/summary'))data={active:2,pending:0,blocked:0,missing_photo:1};
 else if(p.endsWith('/devices/summary'))data={total:2,active:1,inactive:1,maintenance:0};
 else if(p.endsWith('/attendance/summary'))data={total_present:2,total_late:0};
 else if(p.endsWith('/waste/summary'))data={organic_kg:3,inorganic_kg:4,total_kg:7};
 else if(p.endsWith('/dashboard/today')){const now=new Date();data={school_id:school.id,date:now.toISOString().slice(0,10),timezone:'Asia/Makassar',generated_at:now.toISOString(),stale_after:new Date(+now+120000).toISOString(),metrics:{attendance:{total:2,students:2,late:0},waste:{total_kg:7,transactions:2},library:{visits:2,students:2},extracurricular:{recorded:2,present:2}}};}
 else if(p.endsWith('/dashboard/rankings'))data={arrivals:[],waste:[],library:[],hourly:[]};
 else if(p.endsWith('/dashboard/support'))data={period_start:'2026-10-01',period_end:'2026-10-31',late:{rows:[],total:0},waste:{rows:[],total:0},library:{rows:[],total:0}};
 await new Promise(r=>setTimeout(r,url.searchParams.get('search')==='AAA'?700:delay));
 await req.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,data,meta:{total:Array.isArray(data)?data.length:0,page:1,page_size:50}})});
 });
 const base=process.env.AKSIS_ADMIN_BASE_URL||'http://127.0.0.1:4196';await page.goto(base+'/students');await page.waitForSelector('.btn-edit-student');
 assert(!requests.includes('/api/v1/schools/current/context'),'bootstrap context is embedded');
 assert.equal(await page.$eval('#sidebar',e=>Math.round(e.getBoundingClientRect().width)),76);
 const before=await page.$eval('.workspace',e=>e.getBoundingClientRect().left);await page.hover('#sidebar');await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().width>255);
 assert.equal(await page.$eval('.workspace',e=>e.getBoundingClientRect().left),before,'expansion must not squeeze content');
 assert(await page.$$eval('.sidebar .nav-icon svg',els=>els.every(e=>Math.round(e.getBoundingClientRect().width)===22)));
 await page.mouse.move(900,100);await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().width<78);
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 const navigate=async route=>{await page.evaluate(path=>document.querySelector(`.sidebar a[href="${path}"]`).click(),route);await page.waitForFunction(path=>location.pathname===path,{},route);};
 for(const [width,height]of[[1920,1080],[1440,900],[1280,720],[1024,600],[768,1024],[600,960],[390,844],[320,740]]){
 await page.setViewport({width,height});await page.mouse.move(width-10,100);await new Promise(r=>setTimeout(r,220));const g=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,workspace:document.querySelector('.workspace').getBoundingClientRect().toJSON(),columns:getComputedStyle(document.querySelector('.students-layout')).gridTemplateColumns,sidebar:{width:document.querySelector('#sidebar').getBoundingClientRect().width,expanded:document.querySelector('#sidebar').classList.contains('expanded')}}));geometry.push(g);if(width>760)assert(Math.abs(g.sidebar.width-76)<1,`collapsed rail width ${width}: ${g.sidebar.width}`);await page.screenshot({path:`${output}/students-${width}.png`,fullPage:true});if(width===1440)await page.screenshot({path:`${output}/desktop-viewport.png`});assert(g.scrollWidth<=width,`student page overflow ${width}: ${g.scrollWidth}`);
 }
 await page.setViewport({width:390,height:844});await page.click('.menu-button');await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().left===0);assert.equal(await page.$eval('.menu-button',e=>e.getAttribute('aria-expanded')),'true');await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('#sidebar').contains(document.activeElement)||document.activeElement.matches('.menu-button')));await page.keyboard.press('Escape');assert.equal(await page.$eval('.menu-button',e=>e.getAttribute('aria-expanded')),'false');
 await page.setViewport({width:1280,height:800});await navigate('/academic-years');await page.waitForFunction(()=>document.body.textContent.includes('2026/2027'));
 const count=requests.filter(p=>p.includes('/students?')).length;const start=performance.now();await navigate('/students');await page.waitForSelector('.btn-edit-student');timings.push({case:'return-to-students',elapsed_ms:Math.round(performance.now()-start),additional_requests:requests.filter(p=>p.includes('/students?')).length-count});assert.equal(timings[0].additional_requests,0);
 await page.$eval('#table-search',e=>{e.value='AAA';e.dispatchEvent(new Event('input'));});await new Promise(r=>setTimeout(r,350));await page.$eval('#table-search',e=>{e.value='BBB';e.dispatchEvent(new Event('input'));});await new Promise(r=>setTimeout(r,1100));assert(await page.$eval('#table-data',e=>e.textContent.includes('Nur Aisyah')&&!e.textContent.includes('Andi Muhammad')),'stale search must not overwrite newer result');
 const routes=['/academic-years','/devices','/cards','/pwa-portals','/attendance','/reports','/waste','/library','/extracurricular','/led','/'];
 for(const route of routes){const count=requests.filter(p=>p.includes('/students?')).length;await navigate(route);await new Promise(r=>setTimeout(r,300));assert.equal(await page.$('.state-error'),null,`page error ${route}`);for(const width of[1280,390]){await page.setViewport({width,height:844});await new Promise(r=>setTimeout(r,80));const size=await page.evaluate(()=>document.documentElement.scrollWidth);geometry.push({route,width,scrollWidth:size});assert(size<=width,`overflow ${route} at ${width}: ${size}`);}if(route==='/pwa-portals')assert.equal(requests.filter(p=>p.includes('/students?')).length,count,'QR page never loads full student roster');await page.setViewport({width:1280,height:844});}
 await navigate('/students');await page.waitForSelector('.btn-edit-student');await page.click('.btn-edit-student');await page.waitForSelector('#student-modal',{visible:true});await page.$eval('#edit-full-name',e=>e.value='Andi Data Baru');await page.click('#btn-save-student');await page.waitForFunction(()=>document.getElementById('table-data')?.textContent.includes('Andi Data Baru'));
 await page.click('[data-action=toggle-theme]');await page.screenshot({path:`${output}/students-dark.png`,fullPage:true});await page.click('[data-action=toggle-theme]');
 assert.equal(spreadsheets.length,0,'spreadsheet module must stay off the initial/dashboard request path');
 await page.evaluate(()=>document.querySelector('a[href="/student-import"]').click());await page.waitForSelector('#btn-download-excel');await page.waitForFunction(()=>document.querySelector('#target-class-select').options.length>1);
 const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'deny'});
 const spreadsheet=page.waitForRequest(req=>req.url().includes('xlsx'));await page.click('#btn-download-excel');await spreadsheet;await new Promise(r=>setTimeout(r,300));assert(spreadsheets.length>0,'spreadsheet loads on demand');
 await page.evaluate(()=>document.querySelector('a[href="/students"]').click());await page.waitForSelector('.btn-edit-student');
 // A slow page must not replace a destination chosen while it is loading.
 delay=500;await page.click('[data-action=refresh]');await navigate('/reports');await new Promise(r=>setTimeout(r,800));assert.equal(await page.$eval('.page-heading h1',e=>e.textContent),'Laporan Wali Kelas');
 assert.deepEqual(errors,[]);await writeFile(`${output}/results.json`,JSON.stringify({result:'PASS',geometry,timings,request_count:requests.length,cases:['hover expand and collapse','stable workspace width','consistent SVG icons','mobile drawer and Escape','12 menu routes','8 student viewports','warm navigation without new student request','stale search ignored','QR roster request removed','mutation invalidates cache','dark theme','rapid navigation race','Excel loads only on demand']},null,2));console.log('PASS: admin responsive workspace, hover sidebar, all 12 menus, cache and navigation lifecycle');
}finally{await browser.close();if(server)await server.close();}
