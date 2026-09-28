import express from 'express';
import request from 'supertest';
import { describe,expect,it,vi } from 'vitest';
import { requirePlatform } from './platform.js';
import { requirePermission } from './tenant.js';
function app(allowed:boolean|null, error:unknown=null){const server=express(),rpc=vi.fn().mockResolvedValue({data:allowed,error});server.use((req,_res,next)=>{req.auth={client:{rpc},user:{app_metadata:{}}} as unknown as NonNullable<typeof req.auth>;req.tenant={schoolId:'school',membershipId:'member',roles:['SUPER_ADMIN'],permissions:[]};next();});server.get('/',requirePlatform,(_req,res)=>res.sendStatus(204));server.use(((e:any,_req:any,res:any,_next:any)=>res.status(e.status??500).json({code:e.code})) as express.ErrorRequestHandler);return{server,rpc};}
describe('Platform boundary',()=>{
 it('denies a forged tenant SUPER_ADMIN role when trusted authority is absent',async()=>{const{server,rpc}=app(false);await request(server).get('/').expect(403);expect(rpc).toHaveBeenCalledWith('is_platform_admin');});
 it('fails closed when authority lookup fails',async()=>{await request(app(null,{code:'XX000',message:'unavailable'}).server).get('/').expect(500);});
 it('permits verified platform authority',async()=>{await request(app(true).server).get('/').expect(204);});
 it('does not allow SCHOOL_ADMIN to bypass explicit permission grants',()=>{const next=vi.fn();requirePermission('card.write')({tenant:{roles:['SCHOOL_ADMIN'],permissions:[]}} as any,{} as any,next);expect(next.mock.calls[0]?.[0]).toMatchObject({status:403});});
});
