// Invoked only inside the disposable local PostgreSQL runner; refuses TCP or external DB.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import{join}from'node:path';import{spawn,spawnSync}from'node:child_process';import assert from'node:assert/strict';
assert(process.env.PGHOST?.includes('aksis-db-audit.')&&!process.env.DATABASE_URL,'Disposable local DB required');
const dir=mkdtempSync(join(tmpdir(),'aksis-attendance-race-'));
const sql=readFileSync('supabase/tests/attendance_mobile_integration.sql','utf8').split('create function pg_temp.scan')[0]+'\ncommit;';
const setup=join(dir,'setup.sql');writeFileSync(setup,sql);
const init=spawnSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-f',setup],{encoding:'utf8'});if(init.status)throw Error(init.stderr);
try{
 await Promise.all(Array.from({length:10},(_,i)=>new Promise((resolve,reject)=>{
  const hm=`07:${String(30+i).padStart(2,'0')}`;
  const scan={event_id:`b0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,device_id:`c0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,identifier:i%2?'PORTAL-QR-1':'A1',direction:'CHECK_IN',notes:i?'Macet':'',scanner_name:`Guru ${i+1}`};
  const statement=`begin;set local role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true); select public.sync_school_attendance('20000000-0000-4000-8000-000000000001',jsonb_build_array('${JSON.stringify(scan)}'::jsonb||jsonb_build_object('occurred_at',((now() at time zone 'Asia/Makassar')::date-1+'${hm}'::time) at time zone 'Asia/Makassar')));commit;`;
  const p=spawn('psql',['-X','-q','-v','ON_ERROR_STOP=1','-c',statement]);let error='';p.stderr.on('data',b=>error+=b);p.on('exit',code=>code?reject(Error(error)):resolve());
 })));
 const result=spawnSync('psql',['-X','-At','-v','ON_ERROR_STOP=1','-c',"select json_build_object('canonical',count(*),'earliest',min(to_char(occurred_at_local at time zone 'Asia/Makassar','HH24:MI')),'late',bool_or(is_late),'events',(select count(*) from public.attendance_scan_events)) from public.attendance_logs where school_id='20000000-0000-4000-8000-000000000001'"],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
 const proof=JSON.parse(result.stdout);assert.deepEqual(proof,{canonical:1,earliest:'07:30',late:false,events:10});console.log('PASS: 10 simultaneous PostgreSQL sessions, 10 retained events, 1 canonical arrival at 07:30',JSON.stringify(proof));
}finally{rmSync(dir,{recursive:true,force:true});}
