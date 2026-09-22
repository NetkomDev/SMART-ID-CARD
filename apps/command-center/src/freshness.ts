export type Freshness="FRESH"|"STALE"|"DEGRADED";
export function freshness(staleAfter:string,now=Date.now(),online=true):Freshness{if(!online)return"DEGRADED";return new Date(staleAfter).getTime()>now?"FRESH":"STALE"}
