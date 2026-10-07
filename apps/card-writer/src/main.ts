import './style.css';
import {SerialCardAdapter} from './hardware';
type Job={id:string;lease_token:string;lease_expires_at:string;student_name:string;expected_uid:string;expected_rfid:string;expected_qr:string};
const API=(import.meta.env.VITE_API_BASE_URL as string|undefined)??'/api/v1';
const adapter=new SerialCardAdapter();
const status=document.querySelector<HTMLElement>('#status')!,jobEl=document.querySelector<HTMLElement>('#job')!,log=document.querySelector<HTMLElement>('#log')!;
const device=document.querySelector<HTMLInputElement>('#device')!,secret=document.querySelector<HTMLInputElement>('#secret')!,qr=document.querySelector<HTMLInputElement>('#qr')!,verifyQr=document.querySelector<HTMLInputElement>('#verify-qr')!;
const next=document.querySelector<HTMLButtonElement>('#next')!,complete=document.querySelector<HTMLButtonElement>('#complete')!,retry=document.querySelector<HTMLButtonElement>('#retry')!;
let active:Job|null=null,working=false;
try{active=JSON.parse(sessionStorage.getItem('aksis.writer.active')??'null');}catch{sessionStorage.removeItem('aksis.writer.active');}
function display(){jobEl.textContent=active?`${active.student_name} · Baca kembali chip dan scan QR fisik untuk menyelesaikan verifikasi`:'Scan QR kartu yang telah dicetak dan lolos QC.';next.disabled=!!active||working;complete.disabled=!active||working;retry.hidden=!sessionStorage.getItem('aksis.writer.pending');}
async function post(path:string,body:unknown){if(!device.value||!secret.value)throw Error('Isi Device ID dan token station');const r=await fetch(`${API}${path}`,{method:'POST',headers:{'content-type':'application/json','x-device-id':device.value,authorization:`Device ${secret.value}`},body:JSON.stringify(body)});const json=await r.json();if(!r.ok)throw Error(`${json.error?.code??r.status}: ${json.error?.message??'Station error'}`);return json.data;}
async function action(fn:()=>Promise<void>){if(working)return;working=true;display();try{await fn();}catch(e){status.textContent='Perlu pemeriksaan';log.textContent=e instanceof Error?e.message:'Station error';}finally{working=false;display();}}
async function submit(body:unknown){sessionStorage.setItem('aksis.writer.pending',JSON.stringify({device_id:device.value,body}));const result=await post('/device/card-writer/jobs/complete',body);status.textContent=result.status;log.textContent=JSON.stringify(result,null,2);active=null;sessionStorage.removeItem('aksis.writer.active');sessionStorage.removeItem('aksis.writer.pending');qr.value='';verifyQr.value='';}
document.querySelector<HTMLButtonElement>('#connect')!.onclick=()=>void action(async()=>{await adapter.connect();status.textContent='Station terhubung';});
next.onclick=()=>void action(async()=>{
 if(sessionStorage.getItem('aksis.writer.pending'))throw Error('Kirim ulang hasil tertunda terlebih dahulu');
 if(!qr.value.trim())throw Error('Scan QR fisik terlebih dahulu');
 const chip=await adapter.read();const response=await post('/device/card-writer/jobs/claim',{qr_key:qr.value.trim(),card_uid:chip.uid,lease_seconds:300});active=response.job;sessionStorage.setItem('aksis.writer.active',JSON.stringify(active));
 status.textContent='Menulis chip';try{await adapter.write(active!.expected_rfid,active!.expected_uid);status.textContent='Scan ulang QR fisik, lalu verifikasi';verifyQr.focus();}catch{await submit({job_id:active!.id,lease_token:active!.lease_token,observed_uid:'',observed_rfid:'',observed_qr:'',retryable:true,error_code:'HARDWARE_IO_FAILED'});}
});
complete.onclick=()=>void action(async()=>{if(!active)return;if(!verifyQr.value.trim())throw Error('Scan ulang QR pada kartu fisik');const chip=await adapter.read();await submit({job_id:active.id,lease_token:active.lease_token,observed_uid:chip.uid,observed_rfid:chip.payload,observed_qr:verifyQr.value.trim(),retryable:false,error_code:null});});
retry.onclick=()=>void action(async()=>{const pending=JSON.parse(sessionStorage.getItem('aksis.writer.pending')??'null');if(!pending)return;if(pending.device_id!==device.value)throw Error('Gunakan station yang sama dengan hasil tertunda');await submit(pending.body);});
document.querySelector<HTMLButtonElement>('#release-local')!.onclick=()=>void action(async()=>{if(active&&Date.parse(active.lease_expires_at)>Date.now())throw Error('Lease masih aktif. Selesaikan verifikasi atau tunggu lease kedaluwarsa.');active=null;sessionStorage.removeItem('aksis.writer.active');sessionStorage.removeItem('aksis.writer.pending');status.textContent='Scan ulang kartu; status server akan diperiksa sebelum penulisan';});
// Device secrets intentionally remain in memory; never use a Super Admin token here.
let heartbeatRunning=false;const started=Date.now();setInterval(()=>{if(heartbeatRunning||!device.value||!secret.value)return;heartbeatRunning=true;void post('/devices/heartbeat',{uptime_seconds:Math.floor((Date.now()-started)/1000),firmware_version:'card-station-web-v1',storage_status:{pending:!!active},reported_at:new Date().toISOString()}).catch(()=>{}).finally(()=>{heartbeatRunning=false;});},30000);
display();

let scanner: any = null;
let scanning = false;
document.querySelector<HTMLButtonElement>('#btn-toggle-camera')!.onclick = async () => {
  if (scanning) {
    if (scanner) await scanner.stop();
    scanning = false;
    document.querySelector<HTMLElement>('#qr-reader')!.style.display = 'none';
    document.querySelector<HTMLButtonElement>('#btn-toggle-camera')!.textContent = 'Buka Kamera Scanner';
    return;
  }
  
  const { Html5Qrcode } = await import('html5-qrcode');
  if (!scanner) scanner = new Html5Qrcode('qr-reader');
  
  document.querySelector<HTMLElement>('#qr-reader')!.style.display = 'block';
  document.querySelector<HTMLButtonElement>('#btn-toggle-camera')!.textContent = 'Tutup Kamera';
  scanning = true;

  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (text: string) => {
        if (!active) {
          qr.value = text;
        } else {
          verifyQr.value = text;
        }
        scanner.stop();
        scanning = false;
        document.querySelector<HTMLElement>('#qr-reader')!.style.display = 'none';
        document.querySelector<HTMLButtonElement>('#btn-toggle-camera')!.textContent = 'Buka Kamera Scanner';
        status.textContent = 'QR Berhasil discan (Kamera)';
      },
      undefined
    );
  } catch (err: any) {
    status.textContent = 'Gagal membuka kamera: ' + err.message;
    scanning = false;
    document.querySelector<HTMLElement>('#qr-reader')!.style.display = 'none';
    document.querySelector<HTMLButtonElement>('#btn-toggle-camera')!.textContent = 'Buka Kamera Scanner';
  }
};
