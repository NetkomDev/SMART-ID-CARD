import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePlatform } from '../middleware/platform.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { ApiError, fromDatabaseError } from '../lib/errors.js';
import { createServiceClient } from '../lib/supabase.js';
import { sendData } from '../lib/responses.js';
import { config } from '../config.js';
import { paginationSchema } from '../schemas/common.js';
const router = Router();
router.use(requireAuth, requirePlatform);
const schoolSchema = z.object({code:z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/),name:z.string().trim().min(1).max(200),timezone:z.enum(['Asia/Makassar','Asia/Jakarta','Asia/Jayapura']),idempotency_key:z.uuid()}).strict();
const adminSchema = z.object({email:z.email(),password:z.string().min(12).max(128),full_name:z.string().trim().min(1).max(200),idempotency_key:z.uuid()}).strict();
const id = z.object({id:z.uuid()});
router.get('/schools', validate({query:paginationSchema}), asyncHandler(async(req,res)=>{
  const page=Number(req.query.page),size=Number(req.query.page_size);
  const {data,error,count}=await req.auth!.client.from('schools').select('id,code,name,status,timezone,is_active',{count:'exact'}).is('deleted_at',null).order('name').range((page-1)*size,page*size-1);
  if(error)throw fromDatabaseError(error);
  sendData(res,data,200,{page,page_size:size,total:count??0});
}));
router.get('/stats', asyncHandler(async(req,res)=>{
 const results=await Promise.all([
 req.auth!.client.from('schools').select('id',{count:'exact',head:true}).is('deleted_at',null),
 req.auth!.client.from('students').select('id',{count:'exact',head:true}).is('deleted_at',null).eq('is_active',true),
 req.auth!.client.from('devices').select('id',{count:'exact',head:true}).is('deleted_at',null).eq('status','ACTIVE').gte('last_seen_at',new Date(Date.now()-120000).toISOString()),
 req.auth!.client.from('student_cards').select('id',{count:'exact',head:true}).eq('status','ACTIVE').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)]);
 for(const r of results)if(r.error)throw fromDatabaseError(r.error);
 sendData(res,{total_schools:results[0]!.count,total_students:results[1]!.count,total_devices:results[2]!.count,total_cards:results[3]!.count});
}));
async function provision(req: import('express').Request, res: import('express').Response, existingSchool: string|null) {
 const b=req.body, client=createServiceClient();
 const hash=createHash('sha256').update(JSON.stringify({school:existingSchool,...b})).digest('hex');
 const {data:prior,error:priorError}=await client.from('platform_operations').select('*').eq('id',b.idempotency_key).maybeSingle();
 if(priorError)throw fromDatabaseError(priorError);
 const email=existingSchool?b.email:`admin@${b.code.toLowerCase()}.aksis.co.id`;
 // Derive recoverable credentials from a server-only key and this actor/operation.
 // Auth creation can be recovered after a timeout without storing plaintext passwords.
 const seed=createHmac('sha256',config.SUPABASE_SERVICE_ROLE_KEY).update(`school-provision:${req.auth!.user.id}:${b.idempotency_key}`).digest();
 const password=existingSchool?b.password:createHmac('sha256',config.SUPABASE_SERVICE_ROLE_KEY).update(`school-password:${req.auth!.user.id}:${b.idempotency_key}`).digest('base64url').slice(0,24)+'aA1!';
 if(prior){if(prior.actor_id!==req.auth!.user.id||prior.request_hash!==hash)throw new ApiError(409,'CONFLICT','Idempotency key already used');sendData(res,{school_id:prior.school_id,user_id:prior.user_id,admin_email:email,...(!existingSchool?{admin_password:password}:{}),duplicate:true});return;}
 const fullName=existingSchool?b.full_name:`Admin ${b.name}`;
 seed[6]=(seed[6]! & 15)|64;seed[8]=(seed[8]! & 63)|128;
 const hex=seed.subarray(0,16).toString('hex');
 const uid=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 const matches=(user: {app_metadata?: Record<string,unknown>}|null)=>user?.app_metadata?.provisioning_operation===b.idempotency_key&&user?.app_metadata?.provisioning_actor===req.auth!.user.id&&user?.app_metadata?.provisioning_hash===hash;
 const priorAuth=await client.auth.admin.getUserById(uid);
 if(priorAuth.data.user){if(!matches(priorAuth.data.user))throw new ApiError(409,'CONFLICT','Provisioning identity conflict');}
 else {
   if(priorAuth.error && priorAuth.error.status!==404)throw new ApiError(503,'SERVER_UNAVAILABLE','Unable to check provisioning identity');
   const created=await client.auth.admin.createUser({id:uid,email,password,email_confirm:true,user_metadata:{full_name:fullName},app_metadata:{provisioning_operation:b.idempotency_key,provisioning_actor:req.auth!.user.id,provisioning_hash:hash}});
   if(created.error){const recovered=await client.auth.admin.getUserById(uid);if(!matches(recovered.data.user))throw new ApiError(created.error.status===422?409:503,created.error.status===422?'CONFLICT':'SERVER_UNAVAILABLE',`Provisioning incomplete. Retry with the same operation ID: ${b.idempotency_key}`);}
 }
 const {data,error}=await client.rpc('provision_school',{p_operation:b.idempotency_key,p_actor:req.auth!.user.id,p_user:uid,p_name:b.name??null,p_code:b.code??null,p_timezone:b.timezone??null,p_full_name:fullName,p_existing_school:existingSchool,p_hash:hash});
 if(error){
   // Resolve an ambiguous RPC response before compensating Auth creation.
   const check=await client.from('platform_operations').select('user_id,school_id').eq('id',b.idempotency_key).maybeSingle();
   if(check.error)throw new ApiError(503,'SERVER_UNAVAILABLE',`Provisioning requires reconciliation. Operation: ${b.idempotency_key}`);
   if(check.data?.user_id===uid){sendData(res,{...check.data,admin_email:email,...(!existingSchool?{admin_password:password}:{})},201);return;}
   // Keep the recoverable Auth identity, with no tenant access until transaction commits.
   // A retry with the same operation key resumes it; deleting here can race another retry.
   throw fromDatabaseError(error);
 }
 sendData(res,{...data,admin_email:email,...(!existingSchool?{admin_password:password}:{})},201);
}
router.post('/schools',validate({body:schoolSchema}),asyncHandler((req,res)=>provision(req,res,null)));
router.post('/schools/:id/admin',validate({params:id,body:adminSchema}),asyncHandler((req,res)=>provision(req,res,String(req.params.id))));
router.patch('/schools/:id',validate({params:id,body:z.object({name:z.string().trim().min(1).max(200),timezone:z.enum(['Asia/Makassar','Asia/Jakarta','Asia/Jayapura']),status:z.enum(['ACTIVE','SUSPENDED','INACTIVE'])}).strict()}),asyncHandler(async(req,res)=>{const {data,error}=await req.auth!.client.rpc('platform_update_school',{p_school:req.params.id,p_name:req.body.name,p_timezone:req.body.timezone,p_status:req.body.status});if(error)throw fromDatabaseError(error);sendData(res,data);}));
router.get('/devices',validate({query:paginationSchema}),asyncHandler(async(req,res)=>{
 const page=Number(req.query.page),size=Number(req.query.page_size);const {data,error,count}=await req.auth!.client.from('devices').select('id,school_id,name,device_code,device_type,status,last_seen_at,firmware_version,schools(name)',{count:'exact'}).is('deleted_at',null).order('last_seen_at',{ascending:false,nullsFirst:false}).range((page-1)*size,page*size-1);if(error)throw fromDatabaseError(error);
 sendData(res,(data??[]).map(d=>({...d,online:d.status==='ACTIVE'&&!!d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<120000})),200,{page,page_size:size,total:count??0});
}));
router.post('/devices/:id/credential',validate({params:id}),asyncHandler(async(req,res)=>{const secret=randomBytes(32).toString('base64url');const {error}=await req.auth!.client.rpc('platform_rotate_device',{p_device:req.params.id,p_hash:createHash('sha256').update(secret).digest('hex')});if(error)throw fromDatabaseError(error);sendData(res,{token:secret});}));
router.patch('/devices/:id',validate({params:id,body:z.object({status:z.enum(['ACTIVE','DISABLED','MAINTENANCE','RETIRED'])}).strict()}),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.rpc('platform_device_status',{p_device:req.params.id,p_status:req.body.status});if(error)throw fromDatabaseError(error);sendData(res,data);}));
router.get('/audit',validate({query:paginationSchema}),asyncHandler(async(req,res)=>{const page=Number(req.query.page),size=Number(req.query.page_size);const{data,error,count}=await req.auth!.client.from('audit_logs').select('id,school_id,actor_user_id,action,resource_type,resource_id,occurred_at,before_data,after_data,schools(name)',{count:'exact'}).order('occurred_at',{ascending:false}).range((page-1)*size,page*size-1);if(error)throw fromDatabaseError(error);sendData(res,data,200,{page,page_size:size,total:count??0});}));
router.get('/iam',validate({query:paginationSchema}),asyncHandler(async(req,res)=>{const page=Number(req.query.page),size=Number(req.query.page_size);const{data,error,count}=await req.auth!.client.from('school_users').select('id,school_id,user_id,status,users(full_name),schools(name),school_user_roles(roles(code,role_permissions(permissions(code))))',{count:'exact'}).is('deleted_at',null).order('created_at',{ascending:false}).range((page-1)*size,page*size-1);if(error)throw fromDatabaseError(error);sendData(res,data,200,{page,page_size:size,total:count??0});}));
router.patch('/iam/:id',validate({params:id,body:z.object({status:z.enum(['ACTIVE','SUSPENDED','REVOKED']),roles:z.array(z.enum(['SCHOOL_ADMIN','TEACHER','EXTRA_TEACHER','LIBRARY_STAFF','WASTE_STAFF','PARENT'])).min(1).max(6)}).strict()}),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.rpc('platform_update_membership',{p_id:req.params.id,p_status:req.body.status,p_roles:req.body.roles});if(error)throw fromDatabaseError(error);sendData(res,data);}));
export {router as platformRouter};
