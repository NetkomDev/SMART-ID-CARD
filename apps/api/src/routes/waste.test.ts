import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wasteRouter } from './waste.js';
import { readWasteDashboard } from '../services/waste-dashboard.js';
vi.mock('../services/waste-dashboard.js', () => ({ readWasteDashboard: vi.fn() }));
const id = '10000000-0000-4000-8000-000000000001';
const deposit = { event_id:id, class_id:id, student_id:id, organic_kg:2.4, inorganic_kg:0, source:'MANUAL' };
function fixture(options: { denied?:boolean; existing?:Record<string,unknown>; race?:boolean; rpcError?: { code:string; message:string } } = {}) {
 let reads=0;
 const filters: [string,unknown][]=[];
 const insert=vi.fn();
 const query = {
  select:()=>query,eq:(k:string,v:unknown)=>{filters.push([k,v]);return query;},
  maybeSingle:async()=>({data:options.existing ?? (options.race && reads++>0 ? deposit:null),error:null}),
  insert:(data:unknown)=>{insert(data);return query;},
  single:async()=>({data:options.race?null:{...deposit,points_earned:18},error:options.race?{code:'23505'}:null})
 };
 const client={from:vi.fn(()=>query),rpc:vi.fn(async()=>({data:{classes:[]},error:options.rpcError ?? null}))};
 const app=express();app.use(express.json());app.use((req,_res,next)=>{
  req.auth={user:{id:'staff-id'},client} as unknown as NonNullable<typeof req.auth>;
  req.tenant={schoolId:'school-a',membershipId:'member',roles:[],permissions:options.denied?[]:['waste.read','waste.create']};next();
 });app.use('/waste',wasteRouter);
 app.use(((error:{status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.status??500).json({error:'failed'})) as express.ErrorRequestHandler);
 return {app,client,insert,filters};
}
describe('waste PWA API',()=>{
 beforeEach(() => vi.mocked(readWasteDashboard).mockReset());
 it('uses the compatibility reader only for a missing RPC with the authorized school',async()=>{
  const {app,client}=fixture({rpcError:{code:'PGRST202',message:'Function missing'}});
  vi.mocked(readWasteDashboard).mockResolvedValue({classes:[]} as never);
  const response=await request(app).get('/waste/dashboard?period=today&school_id=other').expect(200);
  expect(readWasteDashboard).toHaveBeenCalledWith(client,'staff-id',false,'school-a','today');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.data.school_id).toBe('school-a');
 });
 it('never falls back after a database permission denial',async()=>{
  const {app}=fixture({rpcError:{code:'42501',message:'Access denied'}});
  await request(app).get('/waste/dashboard').expect(403);
  expect(readWasteDashboard).not.toHaveBeenCalled();
 });
 it('only passes the authenticated tenant and validated period to the ranking RPC',async()=>{
  const {app,client}=fixture();const response=await request(app).get('/waste/dashboard?period=today&school_id=other').expect(200);
  expect(response.body.data.school_id).toBe('school-a');
  expect(client.rpc).toHaveBeenCalledWith('waste_dashboard',{p_school_id:'school-a',p_period:'today'});
  await request(app).get('/waste/dashboard?period=bad').expect(400);
  expect(client.rpc).toHaveBeenCalledTimes(1);
 });
 it('checks permissions before database access',async()=>{
  const {app,client}=fixture({denied:true});await request(app).get('/waste/dashboard').expect(403);
  await request(app).post('/waste/transactions').send(deposit).expect(403);expect(client.rpc).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
 });
 it('binds new deposits to the authenticated school and operator',async()=>{
  const {app,insert}=fixture();await request(app).post('/waste/transactions').send(deposit).expect(201);
  expect(insert).toHaveBeenCalledWith({...deposit,school_id:'school-a',staff_user_id:'staff-id'});
 });
 it('replies to a retry without inserting again or requiring an open schedule',async()=>{
  const {app,insert,filters}=fixture({existing:deposit});await request(app).post('/waste/transactions').send(deposit).expect(200);
  expect(insert).not.toHaveBeenCalled();expect(filters).toContainEqual(['school_id','school-a']);
 });
 it('rejects reuse of the same event id with different contents',async()=>{
  const {app,insert}=fixture({existing:{...deposit,organic_kg:7}});await request(app).post('/waste/transactions').send(deposit).expect(409);expect(insert).not.toHaveBeenCalled();
 });
 it('recovers from a concurrent unique-key conflict',async()=>{
  const {app,insert}=fixture({race:true});await request(app).post('/waste/transactions').send(deposit).expect(200);expect(insert).toHaveBeenCalledTimes(1);
 });
});
