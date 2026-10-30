import { mountDevicePairing } from "../../shared/device-pairing";
document.title = "AKSIS LED — Simulator";
import"./style.css";import{fallbackState,SimulatorLedAdapter,type GatewayState,type LedContent}from"./state.js";
const API=(import.meta.env.VITE_API_BASE_URL as string|undefined)??"/api/v1",CACHE="aksis.led.content",adapter=new SimulatorLedAdapter();
let pairedDevice="",pairedSecret="";
const headers=()=>({"content-type":"application/json","x-device-id":pairedDevice,authorization:`Device ${pairedSecret}`});
const cached=()=>{try{return JSON.parse(localStorage.getItem(CACHE)??"null") as LedContent|null}catch{return null}};
async function acknowledge(content:LedContent,success:boolean,error_code:string|null=null){await fetch(`${API}/device/led/acknowledgements`,{method:"POST",headers:headers(),body:JSON.stringify({content_id:content.id,content_version:content.version,success,error_code})})}
async function render(state:GatewayState){const content=state.content;document.querySelector("#connection")!.textContent=state.mode;document.querySelector("#priority")!.textContent=content?.priority??"FALLBACK";document.querySelector("#version")!.textContent=content?String(content.version):"-";document.querySelector("#title")!.textContent=content?.title??"Informasi sekolah";if(content){try{await adapter.render(content);localStorage.setItem(CACHE,JSON.stringify(content));if(state.mode==="LIVE")await acknowledge(content,false,"SIMULATOR_ONLY")}catch{if(state.mode==="LIVE")await acknowledge(content,false,"CONTROLLER_RENDER_FAILED")}}else await adapter.fallback("AKSIS • Informasi sekolah")}
async function refresh(){try{const response=await fetch(`${API}/device/led/state`,{headers:headers()});if(!response.ok)throw new Error();const body=await response.json();await render(body.data as GatewayState)}catch{await render(fallbackState(cached()))}}
async function heartbeat(){await fetch(`${API}/device/led/heartbeat`,{method:"POST",headers:headers(),body:JSON.stringify({firmware_version:"web-gateway-1.0.0",controller_online:false,cached_content_id:cached()?.id??null,last_error:"SIMULATOR_ONLY: controller status unknown",reported_at:new Date().toISOString()})})}
document.querySelector<HTMLButtonElement>("#refresh")!.onclick=()=>void refresh();void refresh();setInterval(()=>void refresh(),15000);setInterval(()=>void heartbeat().catch(()=>undefined),60000);if("serviceWorker"in navigator&&import.meta.env.PROD)void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL});

mountDevicePairing((id,secret)=>{pairedDevice=id;pairedSecret=secret;void refresh();});
