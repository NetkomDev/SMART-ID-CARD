import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFile,writeFile}from'node:fs/promises';
const base=process.env.AKSIS_PRODUCTION_URL||'https://www.aksis.co.id',checks=[];
const get=async path=>{const response=await fetch(new URL(path,base),{cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,path);return response;};
for(const route of['waste','library','extracurricular']){
 const html=await(await get(`/${route}/`)).text();assert(html.includes('scanner-viewport'),`${route}: new scanner markup`);assert(html.includes('brand-mark.webp'),`${route}: optimized logo`);
 const script=html.match(/<script\b[^>]*src="([^"]+\.js)"/)?.[1],css=html.match(/<link\b[^>]*href="([^"]+\.css)"/)?.[1];assert(script&&css,`${route}: bundled assets`);
 const js=await(await get(script)).text(),style=await(await get(css)).text();assert(js.includes('fps:8'),`${route}: current scanner engine`);assert(style.includes('scanner-viewport')&&style.includes('touch-action:pan-y'),`${route}: responsive scanner styles`);
 if(route==='waste')assert(js.includes('/students/resolve'),'waste: single identity endpoint');if(route==='extracurricular')assert(js.includes('/scan'),'extracurricular: scan workflow');
 const worker=await(await get(`/${route}/sw.js`)).text();assert(worker.includes('-v11')&&worker.includes('webp'),`${route}: updated offline shell`);
 const logo=Buffer.from(await(await get(`/${route}/brand-mark.webp`)).arrayBuffer()),local=await readFile('apps/admin-web/public/brand-mark.webp');const hash=v=>createHash('sha256').update(v).digest('hex');assert.equal(hash(logo),hash(local),`${route}: optimized asset matches source`);
 checks.push({route,result:'PASS',script,css,logo_bytes:logo.length,engine:'8 fps, QR-only',service_worker:'v11'});
}
for(const path of['/api/v1/students/resolve','/api/v1/library/visits','/api/v1/extracurriculars/22222222-2222-4222-8222-222222222222/sessions/33333333-3333-4333-8333-333333333333/scan']){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});assert.equal(r.status,401,`${path}: unauthorized boundary`);checks.push({path,status:r.status});}
const result={result:'PASS',verified_at:new Date().toISOString(),base,checks,method:'Public HTTP assets and authentication boundaries; no business transactions written'};
await writeFile(process.env.AKSIS_SCANNER_SMOKE_OUTPUT||'docs/analysis/2026-10-31/pwa-scanners/production-smoke.json',JSON.stringify(result,null,2));console.log('PASS: all 3 deployed scanner pages, assets, optimized logos, service workers and authentication boundaries');
