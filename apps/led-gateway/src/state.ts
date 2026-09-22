export const LED_PRIORITY=["EMERGENCY","ADMIN_OVERRIDE","ACHIEVEMENT","NORMAL_DASHBOARD","RUNNING_TEXT"] as const;
export type LedContent={id:string;priority:typeof LED_PRIORITY[number];title:string|null;body:string;version:number;ends_at:string|null};
export type GatewayState={mode:"LIVE"|"CACHED"|"FALLBACK";content:LedContent|null;server_time?:string};
export function fallbackState(cached:LedContent|null,now=Date.now()):GatewayState{if(cached&&(!cached.ends_at||new Date(cached.ends_at).getTime()>now))return{mode:"CACHED",content:cached};return{mode:"FALLBACK",content:null}}
export interface LedControllerAdapter{render(content:LedContent):Promise<void>;fallback(message:string):Promise<void>}
export class HuiduAdapter implements LedControllerAdapter{async render(content:LedContent){document.querySelector("#screen")!.textContent=content.body}async fallback(message:string){document.querySelector("#screen")!.textContent=message}}
