import express from 'express';
import request from 'supertest';
import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({allowed:true,dbError:false,rpcError:false,operation:null as any,users:new Map<string,any>(),service:null as any,userClient:null as any}));
vi.mock('../middleware/auth.js',()=>({requireAuth:(req:any,_res:any,next:any)=>{req.auth={user:{id:'10000000-0000-4000-8000-000000000001'},client:fixture.userClient};next();}}));
vi.mock('../lib/supabase.js',()=>({createServiceClient:()=>fixture.service}));
let router:express.Router;
let productionRouter:express.Router;
beforeAll(async()=>{process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='test-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-secret-not-real';({platformRouter:router}=await import('./platform.js')); ({cardProductionRouter:productionRouter}=await import('./card-production.js'));});
beforeEach(()=>{
 fixture.allowed=true;fixture.dbError=false;fixture.rpcError=false;fixture.operation=null;fixture.users.clear();
 const query:any={select:()=>query,is:()=>query,eq:()=>query,gte:()=>query,or:()=>query,then:(resolve:any)=>Promise.resolve(resolve({count:4,data:[],error:fixture.dbError?{code:'42P01',message:'Missing table'}:null}))};
 fixture.userClient={rpc:vi.fn().mockImplementation(async()=>({data:fixture.allowed,error:null})),from:vi.fn(()=>query)};
 fixture.service={from:vi.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:fixture.operation,error:null})})})})),auth:{admin:{getUserById:vi.fn(async(id:string)=>({data:{user:fixture.users.get(id)??null},error:fixture.users.has(id)?null:{status:404}})),createUser:vi.fn(async(user:any)=>{fixture.users.set(user.id,user);return{data:{user},error:null};})}},rpc:vi.fn(async(_name:string,args:any)=>fixture.rpcError?{data:null,error:{code:'23505',message:'Conflict'}}:{data:{school_id:'20000000-0000-4000-8000-000000000001',user_id:args.p_user},error:null})};
});
function app(){const a=express();a.use(express.json());a.use('/platform/production',productionRouter);a.use('/platform',router);a.use(((e:any,_req:any,res:any,_next:any)=>res.status(e.status??500).json({error:{code:e.code}})) as express.ErrorRequestHandler);return a;}
const body={code:'TEST_SCHOOL',name:'Test school',timezone:'Asia/Makassar',idempotency_key:'70000000-0000-4000-8000-000000000001'};
describe('Platform API',()=>{
 it('blocks every card print operation for school accounts before reading or changing data',async()=>{
  fixture.allowed=false;
  for(const [method,path] of [['get','/batches'],['get','/batches/70000000-0000-4000-8000-000000000001'],['post','/batches'],['post','/batches/70000000-0000-4000-8000-000000000001/action']] as const){
   await request(app())[method]('/platform/production'+path).send({}).expect(403);
  }
  expect(fixture.userClient.from).not.toHaveBeenCalled();
  expect(fixture.userClient.rpc.mock.calls.every((call:any[])=>call[0]==='is_platform_admin')).toBe(true);
 });
 it('does not create Auth users when authority is denied',async()=>{fixture.allowed=false;await request(app()).post('/platform/schools').send(body).expect(403);expect(fixture.service.auth.admin.createUser).not.toHaveBeenCalled();});
 it('rejects malformed school data before provisioning',async()=>{await request(app()).post('/platform/schools').send({...body,code:'invalid school'}).expect(422);expect(fixture.service.auth.admin.createUser).not.toHaveBeenCalled();});
 it('uses student_cards and surfaces aggregate failures instead of false zero counts',async()=>{fixture.dbError=true;await request(app()).get('/platform/stats').expect(500);expect(fixture.userClient.from).toHaveBeenCalledWith('student_cards');expect(fixture.userClient.from).not.toHaveBeenCalledWith('cards');});
 it('returns success only after atomic database provisioning',async()=>{const result=await request(app()).post('/platform/schools').send(body).expect(201);expect(result.body.data.admin_password).toHaveLength(28);expect(fixture.service.rpc).toHaveBeenCalledWith('provision_school',expect.objectContaining({p_actor:'10000000-0000-4000-8000-000000000001',p_operation:body.idempotency_key}));});
 it('reports database failure and resumes the same Auth identity on retry',async()=>{fixture.rpcError=true;await request(app()).post('/platform/schools').send(body).expect(409);expect(fixture.users.size).toBe(1);fixture.rpcError=false;await request(app()).post('/platform/schools').send(body).expect(201);expect(fixture.service.auth.admin.createUser).toHaveBeenCalledTimes(1);});
 it('does not resume an existing identity with a different request body',async()=>{fixture.rpcError=true;await request(app()).post('/platform/schools').send(body).expect(409);fixture.rpcError=false;await request(app()).post('/platform/schools').send({...body,name:'Changed request'}).expect(409);expect(fixture.service.auth.admin.createUser).toHaveBeenCalledTimes(1);});
});
