/** Individual IndexedDB records avoid localStorage read/modify/write races across tabs. */
export type DurableItem<T> = {event_id:string;created_at:string;status:'PENDING';retry_count:number;last_error?:string;payload:T};
export class DurableQueue<T> {
  private database:Promise<IDBDatabase>;
  constructor(private readonly scope:()=>string) {
    this.database=new Promise((resolve,reject)=>{const request=indexedDB.open('aksis-pwa-events-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('events',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  }
  get currentScope(){return this.scope();}
  private async transaction<R>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<R>):Promise<R>{const db=await this.database;return new Promise((resolve,reject)=>{const tx=db.transaction('events',mode);const req=action(tx.objectStore('events'));let result:R;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async enqueue(payload:T,eventId:string=crypto.randomUUID()):Promise<void>{const scope=this.scope();const item:DurableItem<T>={event_id:eventId,created_at:new Date().toISOString(),status:'PENDING',retry_count:0,payload};await this.transaction('readwrite',store=>store.add({key:`${scope}:${eventId}`,scope,item}));}
  async getPending(scope=this.scope()):Promise<DurableItem<T>[]>{const rows=await this.transaction('readonly',store=>store.getAll()) as Array<{scope:string;item:DurableItem<T>}>;return rows.filter(x=>x.scope===scope).map(x=>x.item).sort((a,b)=>a.created_at.localeCompare(b.created_at));}
  async markSynced(eventId:string,scope=this.scope()){await this.transaction('readwrite',store=>store.delete(`${scope}:${eventId}`));}
  async markFailed(eventId:string,error:string,scope=this.scope()) {const db=await this.database;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('events','readwrite');const store=tx.objectStore('events');const request=store.get(`${scope}:${eventId}`);request.onsuccess=()=>{const row=request.result;if(row){row.item.retry_count++;row.item.last_error=error;store.put(row);}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
}
