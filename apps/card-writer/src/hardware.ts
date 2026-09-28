export type CardPayload={rfid:string;qr:string};export interface CardHardwareAdapter{write(payload:CardPayload):Promise<void>;readBack():Promise<CardPayload>}
export class SimulatorAdapter implements CardHardwareAdapter{private value:CardPayload|null=null;async write(payload:CardPayload){this.value={...payload}}async readBack(){if(!this.value)throw new Error("NO_CARD");return{...this.value}}}
export function verifyCard(expected:CardPayload,observed:CardPayload){return{rfid_verified:expected.rfid===observed.rfid,qr_verified:expected.qr===observed.qr,success:expected.rfid===observed.rfid&&expected.qr===observed.qr}}

// Firmware contract: newline-delimited JSON, request ID echoed in every response.
// UID is read-only identity; payload is application memory, never a command to overwrite UID.
type SerialPortLike={open(options:{baudRate:number}):Promise<void>;close():Promise<void>;readable:ReadableStream<Uint8Array>|null;writable:WritableStream<Uint8Array>|null};
type WireResult={id:string;ok:boolean;uid?:string;payload?:string;error?:string};
export class SerialCardAdapter {
 private port:SerialPortLike|null=null;
 private pending=new Map<string,{resolve:(r:WireResult)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 async connect(){
  if(this.port)return;
  const serial=(navigator as unknown as {serial?:{requestPort():Promise<SerialPortLike>}}).serial;
  if(!serial)throw new Error('Browser ini belum mendukung Web Serial. Gunakan browser desktop dengan dukungan Web Serial.');
  const port=await serial.requestPort();await port.open({baudRate:115200});if(!port.readable||!port.writable){await port.close();throw Error('Station tidak menyediakan kanal baca/tulis');}this.port=port;void this.readLoop(port);
 }
 private async readLoop(port:SerialPortLike){
  const reader=port.readable!.getReader(),decoder=new TextDecoder();let buffer='';
  try{for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>8192)throw Error('Respons station terlalu besar');let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let r:WireResult;try{r=JSON.parse(line);}catch{continue;}if(!r||typeof r.id!=='string')continue;const p=this.pending.get(r.id);if(!p)continue;clearTimeout(p.timer);this.pending.delete(r.id);r.ok===true?p.resolve(r):p.reject(new Error(r.error??'HARDWARE_IO_FAILED'));}}}
  catch{ /* Outstanding requests fail below on disconnect. */ }
  finally{reader.releaseLock();this.port=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Station terputus'));}this.pending.clear();await port.close().catch(()=>{});}
 }
 private async command(command:string,payload?:string,expectedUid?:string){
  if(!this.port?.writable)throw Error('Hubungkan station terlebih dahulu');
  const id=crypto.randomUUID(),port=this.port;
  return new Promise<WireResult>((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Station timeout'));},15000);this.pending.set(id,{resolve,reject,timer});
   void (async()=>{const writer=port.writable!.getWriter();try{await writer.write(new TextEncoder().encode(JSON.stringify({id,command,...(payload===undefined?{}:{payload}),...(expectedUid===undefined?{}:{expected_uid:expectedUid})})+'\n'));}finally{writer.releaseLock();}})().catch(e=>{clearTimeout(timer);this.pending.delete(id);reject(e);});
  });
 }
 async read(){const r=await this.command('READ_CARD');if(typeof r.uid!=='string'||!/^[0-9A-F]{8,20}$/.test(r.uid)||typeof r.payload!=='string'||r.payload.length>64)throw Error('Respons READ_CARD tidak valid');return{uid:r.uid,payload:r.payload};}
 async write(payload:string,expectedUid:string){await this.command('WRITE_CARD',payload,expectedUid);}
}
