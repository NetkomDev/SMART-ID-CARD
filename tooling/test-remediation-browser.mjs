import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import ts from "typescript";
import puppeteer from "puppeteer-core";
let loggedIn = false, linked = false;
const root = resolve("dist");
const context = { id:"parent-a",user_id:"parent-a",role_code:"PARENT",school_id:"",school_name:"Sekolah anak terhubung",metadata:{},csrf:"fixture-csrf" };
const server = createServer(async (req,res)=>{
  const url = new URL(req.url,"http://localhost");
  if(url.pathname.startsWith("/api/")) {
    let data;
    if(url.pathname.endsWith("/session/login")){loggedIn=true;data={csrf:context.csrf};}
    else if(url.pathname.endsWith("/session/csrf")){if(!loggedIn){res.writeHead(401,{"content-type":"application/json"});res.end(JSON.stringify({success:false,error:{code:"AUTH_REQUIRED",message:"Masuk kembali"}}));return;}data={csrf:context.csrf};}
    else if(url.pathname.endsWith("/session/context"))data=context;
    else if(url.pathname.endsWith("/parent/profile"))data={full_name:"Wali A"};
    else if(url.pathname.endsWith("/parent/children"))data=linked?[{student_id:"child-a",school_name:"Sekolah A",full_name:"Anak A",student_number:"001",class_name:"Kelas 1",relationship:"MOTHER"}]:[];
    else if(url.pathname.endsWith("/parent/link")){linked=true;data={accepted:true,student_id:"child-a",link_id:"link-a"};}
    else if(url.pathname.endsWith("/today"))data={contract_version:2,student_id:"child-a",timezone:"Asia/Makassar",as_of:new Date().toISOString(),profile:{full_name:"Anak A",first_name:"Anak",school_name:"Sekolah A",class_name:"Kelas 1",photo_url:null},attendance:{status:"BELUM_HADIR",check_in:"—",check_out:"—"},waste:{today_kg:0,total_points:0,today_points:0},library:{today_visits:0,month_visits:0},extracurricular:{name:"Tidak ada kegiatan hari ini",status:"TIDAK_ADA",time_attended:"—",schedule:null},events:[]};
    else if(url.pathname.endsWith("/session/logout")){loggedIn=false;res.writeHead(204);res.end();return;}
    else {res.writeHead(404);res.end();return;}
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({success:true,data}));return;
  }
  try {
    if(url.pathname==="/portrait.js") {res.setHeader("content-type","text/javascript");res.end(ts.transpileModule(await readFile("apps/shared/portrait.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);return;}
    const path=resolve(root,"."+decodeURIComponent(url.pathname));if(!path.startsWith(root+"/")&&path!==root)throw Error("Bad path");
    const file=url.pathname.endsWith("/")?resolve(path,"index.html"):path;
    const bytes=await readFile(file);const types={".js":"text/javascript",".css":"text/css",".html":"text/html",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png"};res.setHeader("content-type",types[extname(file)]??"application/octet-stream");res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:process.env.AKSIS_CHROME??"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.setViewport({width:390,height:844});await page.goto(base+"/parent/");await page.waitForSelector("#parent-login");
 await page.type('[name="email"]',"parent@example.test");await page.type('[name="password"]',"fixture-password");await page.click("#parent-login button");
 await page.waitForSelector("#link-child-btn");await page.click("#link-child-btn");await page.waitForSelector('#link-form [name="token"]');
 await page.type('#link-form [name="token"]',"a".repeat(43));await page.click("#link-form button");await page.waitForSelector(".parent-grid");
 for(const width of [320,390,1366]){await page.setViewport({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`parent overflow ${width}`);}
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith("aksis_parent_")||k==="aksis.portal.PARENT.v1")),false,"no persisted family data/tokens");
 const portrait=await page.evaluate(async()=>{const m=await import("/portrait.js");const host=document.createElement("div");document.body.append(host);m.renderPortrait(host,"x');\"><img src=x onerror=window.pwned=true>");return {count:host.querySelectorAll("img").length,pwned:!!window.pwned};});
 assert.deepEqual(portrait,{count:0,pwned:false});
 assert.deepEqual(errors,[]);
 for(const path of ["/","/waste/","/extracurricular/","/library/","/led/","/command/","/card-writer/","/operations/"]){const response=await fetch(base+path);assert.equal(response.status,200,`entrypoint ${path}`);const html=await response.text();for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g))assert.equal((await fetch(new URL(match[1],base))).status,200,`asset ${path} ${match[1]}`);}
 console.log("PASS: parent individual login, invitation, rich dashboard, widths 320/390/1366, no family localStorage, portrait injection, nine entrypoints/assets.");
} finally {await browser.close();await new Promise(r=>server.close(r));}
