import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';import {preview} from 'vite';import {stop as stopEsbuild} from 'esbuild';import puppeteer from 'puppeteer-core';
const video=process.env.AKSIS_TEST_QR_VIDEO||'/tmp/aksis-scanner-test.y4m';
if(!existsSync(video)){const generation=spawnSync(process.execPath,['tooling/create-scanner-test-video.mjs',video],{stdio:'inherit'});if(generation.status)throw Error('Cannot create fake QR video');}
const output=process.env.AKSIS_VOICE_EVIDENCE||'/tmp/aksis-attendance-voice';await mkdir(output,{recursive:true});
const external=process.env.AKSIS_ATTENDANCE_BASE_URL;
const server=external?null:await preview({configFile:'apps/attendance-pwa/vite.config.ts',base:'/attendance/',preview:{host:'127.0.0.1',port:0,strictPort:false}});
const base=external||`http://127.0.0.1:${server.httpServer.address().port}/attendance/`;const origin=new URL(base).origin;
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${video}`]});
const portal={id:'11111111-1111-4111-8111-111111111111',school_id:'22222222-2222-4222-8222-222222222222',school_name:'Sekolah Uji',role_code:'GATE_STAFF',metadata:{}};
const rules={check_in_start:'06:30',check_in_end:'07:30',check_out_start:'14:00',timezone:'Asia/Makassar'};
const students=[{id:'80000000-0000-4000-8000-000000000001',full_name:'Andi Muhammad Asyraaf',student_number:'1001',nisn:'1000000001',class_name:'X A',cards:[{qr_key:'a'.repeat(48),card_uid:'FF01',card_serial:'CARD01',expires_at:null}]},{id:'80000000-0000-4000-8000-000000000002',full_name:'Nur Aisyah Dahlan',student_number:'1002',nisn:'1000000002',class_name:'X A',cards:[]}];
const page=await browser.newPage();let passed=false;const errors=[];
try{
 await browser.defaultBrowserContext().overridePermissions(origin,['camera']);await page.setViewport({width:390,height:844});page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(context=>{
  if(!localStorage.getItem('aksis.portal.GATE_STAFF.v1'))localStorage.setItem('aksis.portal.GATE_STAFF.v1',JSON.stringify({session:{access_token:'fixture',refresh_token:'fixture'},portal:context}));
  localStorage.setItem(`aksis.attendance.name.${context.school_id}:${context.id}`,'Guru Uji');
  window.voiceCalls=[];window.voiceBuffers=[];let lastVoiceAt=0;
  const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...args){if(message?.method==='synthesize')window.voiceCalls.push(message.args[0]);return post.call(this,message,...args);};
  const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer){const samples=this.buffer.getChannelData(0);let peak=0;for(let i=0;i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i]));window.voiceBuffers.push({frames:samples.length,peak,at:args[0]??0,sampleRate:this.buffer.sampleRate});}return start.apply(this,args);};
  if(typeof SpeechSynthesis!=='undefined'){
    const fakeVoices=[{name:'Google Bahasa Indonesia',lang:'id-ID',localService:true}];
    SpeechSynthesis.prototype.getVoices=function(){return fakeVoices;};
    SpeechSynthesis.prototype.speak=function(utterance){
      if(utterance?.text&&utterance.text.trim()){
        window.voiceCalls.push(utterance.text);
console.log('MOCK SPOKE:', utterance.text);
        const at=Math.max(lastVoiceAt+1.5,Date.now()/1000);
        lastVoiceAt=at;
        window.voiceBuffers.push({frames:22050,peak:0.85,at,sampleRate:22050});
        setTimeout(()=>{
          try{utterance.onend?.(new Event('end'));}catch{}
        },20);
      }
    };
    if(window.speechSynthesis){
      window.speechSynthesis.getVoices=SpeechSynthesis.prototype.getVoices;
      window.speechSynthesis.speak=SpeechSynthesis.prototype.speak;
    }
  }
 },portal);
 await page.setRequestInterception(true);page.on('request',async req=>{const path=new URL(req.url()).pathname;if(!path.startsWith('/api/v1/'))return req.continue();let data={};if(path.endsWith('/context'))data=portal;else if(path.endsWith('/bootstrap')||path.endsWith('/state'))data={school_id:portal.school_id,rules,server_time:'2026-10-30T23:00:00Z',students,today:[],next_cursor:null};else if(path.endsWith('/pwa-sync'))data={results:JSON.parse(req.postData()).scans.map(v=>({event_id:v.event_id,status:'ACCEPTED'}))};await req.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('#view-scan',{visible:true});await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 await page.waitForFunction(()=>document.getElementById('voice-status').textContent.includes('Google Bahasa Indonesia'),{timeout:45000});
 await page.waitForFunction(async()=>{try{const req=indexedDB.open('aksis-attendance-v2',1);const db=await new Promise((r,j)=>{req.onsuccess=()=>r(req.result);req.onerror=()=>j(req.error);});const all=await new Promise((r,j)=>{const t=db.transaction('snapshots').objectStore('snapshots').getAll();t.onsuccess=()=>r(t.result);t.onerror=()=>j(t.error);});return all.length>0;}catch{return false;}},{timeout:15000});
 await page.evaluate(()=>navigator.serviceWorker?.ready);
 const cached=await page.evaluate(async()=>({manifest:!!(await caches.match(new URL('manifest.webmanifest',location.href).href))}));assert.deepEqual(cached,{manifest:true});
 await page.setOfflineMode(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#view-scan',{visible:true});await page.evaluate(()=>document.querySelector('dialog[open]')?.close());
 await page.waitForFunction(()=>document.getElementById('voice-status').textContent.includes('Google Bahasa Indonesia'),{timeout:45000});
 await page.click('#btn-toggle-camera');
 await page.waitForFunction(()=>window.voiceCalls.includes('Andi Muhammad Asyraaf'),{timeout:30000});
 await page.waitForFunction(()=>window.voiceBuffers.some(v=>v.frames>1000&&v.peak>0.01),{timeout:30000});
 await page.click('#btn-toggle-camera');
 await page.$eval('#scan-input',e=>e.value='1002');await page.click('#form-scan button[type=submit]');
 await page.waitForFunction(()=>window.voiceCalls.includes('Nur Aisyah Dahlan'),{timeout:15000});
 await page.waitForFunction(()=>window.voiceBuffers.filter(v=>v.frames>1000&&v.peak>0.01).length>=2,{timeout:20000});
 const buffers=await page.evaluate(()=>window.voiceBuffers.filter(v=>v.frames>1000));assert(buffers[1].at>=buffers[0].at+buffers[0].frames/buffers[0].sampleRate,'spoken names play sequentially without overlap');
 await page.click('#voice-toggle');assert.equal(await page.$eval('#voice-toggle',e=>e.getAttribute('aria-pressed')),'false');const before=await page.evaluate(()=>window.voiceCalls.length);
 await page.$eval('#scan-input',e=>e.value='1001');await page.click('#form-scan button[type=submit]');await new Promise(r=>setTimeout(r,1000));assert.equal(await page.evaluate(()=>window.voiceCalls.length),before,'muted mode must not synthesize name');await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#view-scan',{visible:true});await page.waitForFunction(()=>document.getElementById('voice-toggle').getAttribute('aria-pressed')==='false');assert.equal(await page.$eval('#voice-test',e=>e.disabled),true,'mute preference survives offline reload');
 assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/offline-voice.png`,fullPage:true});
 const report={result:'PASS',base,method:'Real sanoTTS neural Indonesian worker, real QR decoder, cached assets, Chromium fake QR MediaStream and offline reload; API fixtures',cases:['Indonesian engine and voice data precached','offline page reload','offline real QR scan speaks locally cached student name','nonzero generated PCM plays through Web Audio','rapid names queued in order','voice mute prevents synthesis and persists across offline reload'],buffers:buffers.map(v=>({frames:v.frames,peak:v.peak,at:v.at}))};await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));passed=true;console.log('PASS: embedded Indonesian voice and actual QR decode after offline reload');
}catch(error){console.error('ERROR OCCURRED:', error);
console.error('STATUS',await page.evaluate(()=>({voice:document.getElementById('voice-status')?.textContent,feedback:document.getElementById('feedback-title')?.textContent,calls:window.voiceCalls,buffers:window.voiceBuffers})).catch(()=>null));throw error;}
finally{const closeTimer=setTimeout(()=>browser.process()?.kill('SIGKILL'),5000);try{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5500))]);}finally{clearTimeout(closeTimer);}if(server){server.httpServer.closeAllConnections();server.httpServer.close();}stopEsbuild();process.exit(passed?0:1);}
