import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePlatform } from '../middleware/platform.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { fromDatabaseError } from '../lib/errors.js';
import { sendData } from '../lib/responses.js';
import { paginationSchema,idParamsSchema } from '../schemas/common.js';
const router=Router();router.use(requireAuth,requirePlatform);
router.get('/candidates',validate({query:paginationSchema.extend({school_id:z.uuid(),class_id:z.uuid().optional(),photo_status:z.enum(['ALL','COMPLETE','MISSING']).optional()})}),asyncHandler(async(req,res)=>{
 const page=Number(req.query.page),size=Number(req.query.page_size);
 let query=req.auth!.client.from('students').select(`id,student_number,full_name,photo_url,student_class_history${req.query.class_id?'!inner':''}(class_id,is_current,classes(name)),student_cards(id,status,production_status)`,{count:'exact'}).eq('school_id',req.query.school_id).eq('is_active',true).is('deleted_at',null).order('full_name').range((page-1)*size,page*size-1);
 if(req.query.class_id)query=query.eq('student_class_history.class_id',req.query.class_id).eq('student_class_history.is_current',true);
 if(req.query.photo_status==='COMPLETE')query=query.not('photo_url','is',null).neq('photo_url','');
 if(req.query.photo_status==='MISSING')query=query.or('photo_url.is.null,photo_url.eq.');
 if(req.query.search)query=query.ilike('full_name',`%${req.query.search}%`);
 const{data,error,count}=await query;if(error)throw fromDatabaseError(error);sendData(res,data,200,{page,page_size:size,total:count??0});
}));
router.get('/classes',validate({query:z.object({school_id:z.uuid()})}),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.from('classes').select('id,name,academic_year_id,academic_years(name)').eq('school_id',req.query.school_id).eq('is_active',true).is('deleted_at',null).order('name');if(error)throw fromDatabaseError(error);sendData(res,data);}));
router.get('/batches',validate({query:paginationSchema}),asyncHandler(async(req,res)=>{const page=Number(req.query.page),size=Number(req.query.page_size);const{data,error,count}=await req.auth!.client.from('card_batches').select('id,school_id,template_version,created_at,schools(name),classes(name),student_cards!inner(production_status)',{count:'exact'}).neq('student_cards.production_status','CANCELLED').order('created_at',{ascending:false}).range((page-1)*size,page*size-1);if(error)throw fromDatabaseError(error);sendData(res,data,200,{page,page_size:size,total:count??0});}));
router.post('/batches',validate({body:z.object({id:z.uuid(),school_id:z.uuid(),student_ids:z.array(z.uuid()).min(1).max(200),class_id:z.uuid().nullable().default(null),replaces_card_id:z.uuid().nullable().default(null)}).strict()}),asyncHandler(async(req,res)=>{const b=req.body;const{data,error}=await req.auth!.client.rpc('create_card_batch',{p_id:b.id,p_school:b.school_id,p_students:b.student_ids,p_class:b.class_id,p_replaces:b.replaces_card_id});if(error)throw fromDatabaseError(error);sendData(res,{id:data},201);}));
router.get('/batches/:id',validate({params:idParamsSchema}),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.from('student_cards').select('id,school_id,student_id,card_serial,qr_key,card_uid,status,production_status,print_snapshot,batch_id').eq('batch_id',req.params.id).order('card_serial');if(error)throw fromDatabaseError(error);sendData(res,data);}));
router.post('/batches/:id/action',validate({params:idParamsSchema,body:z.object({event_id:z.uuid(),action:z.enum(['PRINTED','REPRINTED','RELEASED','CANCEL']),reason:z.string().trim().min(3).max(500)}).strict()}),asyncHandler(async(req,res)=>{const{error}=await req.auth!.client.rpc('card_batch_action',{p_batch:req.params.id,p_event:req.body.event_id,p_action:req.body.action,p_reason:req.body.reason});if(error)throw fromDatabaseError(error);sendData(res,{accepted:true});}));
router.get('/jobs',validate({query:paginationSchema}),asyncHandler(async(req,res)=>{
 const reaped=await req.auth!.client.rpc('reconcile_card_jobs');if(reaped.error)throw fromDatabaseError(reaped.error);
 const page=Number(req.query.page),size=Number(req.query.page_size);const{data,error,count}=await req.auth!.client.from('card_write_jobs').select('id,school_id,card_id,status,attempt_count,max_attempts,last_error_code,lease_expires_at,created_at,schools(name),student_cards(card_serial,print_snapshot),card_write_logs(attempt,success,error_code,created_at)',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*size,page*size-1);if(error)throw fromDatabaseError(error);sendData(res,data,200,{page,page_size:size,total:count??0});
}));
router.post('/jobs/:id/action',validate({params:idParamsSchema,body:z.object({action:z.enum(['RETRY','CANCEL']),reason:z.string().trim().min(3).max(500)}).strict()}),asyncHandler(async(req,res)=>{const{error}=await req.auth!.client.rpc('manage_card_job',{p_job:req.params.id,p_action:req.body.action,p_reason:req.body.reason});if(error)throw fromDatabaseError(error);sendData(res,{accepted:true});}));
router.get('/cards',validate({query:paginationSchema.extend({school_id:z.uuid().optional(),status:z.enum(['ACTIVE','LOST','BLOCKED','REPLACED','EXPIRED']).optional()})}),asyncHandler(async(req,res)=>{
 const page=Number(req.query.page),size=Number(req.query.page_size);let q=req.auth!.client.from('student_cards').select('id,school_id,student_id,card_serial,card_uid,status,production_status,expires_at,schools(name),students!inner(full_name,student_number)',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*size,page*size-1);
 if(req.query.school_id)q=q.eq('school_id',req.query.school_id);if(req.query.status)q=q.eq('status',req.query.status);if(req.query.search)q=q.ilike('students.full_name',`%${req.query.search}%`);
 const{data,error,count}=await q;if(error)throw fromDatabaseError(error);sendData(res,data,200,{page,page_size:size,total:count??0});
}));
router.patch('/cards/:id',validate({params:idParamsSchema,body:z.object({status:z.enum(['ACTIVE','LOST','BLOCKED','EXPIRED']),reason:z.string().trim().min(3).max(500)}).strict()}),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.rpc('set_card_status',{p_card:req.params.id,p_status:req.body.status,p_reason:req.body.reason});if(error)throw fromDatabaseError(error);sendData(res,data);}));
export {router as cardProductionRouter};
