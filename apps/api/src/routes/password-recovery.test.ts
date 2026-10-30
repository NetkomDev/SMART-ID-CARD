import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ member: { user_id: "user-a", school_id: "school-a" } as any, target: { email: "a@example.test", email_confirmed_at: "2026-01-01" } as any, queryError: null as any, execute: true, send: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ createServiceClient: () => ({ auth: { admin: { getUserById: state.getUser } } }), createPublicClient: () => ({ auth: { resetPasswordForEmail: state.send } }) }));
let router: express.Router;
beforeAll(async () => { process.env.SUPABASE_URL="https://example.supabase.co"; process.env.SUPABASE_ANON_KEY="fixture"; ({passwordRecoveryRouter:router}=await import("./password-recovery.js")); });
beforeEach(() => {
  state.member={user_id:"user-a",school_id:"school-a"};state.target={email:"a@example.test",email_confirmed_at:"2026-01-01"};state.queryError=null;state.execute=true;
  state.send.mockReset().mockResolvedValue({error:null});state.getUser.mockReset().mockImplementation(async()=>({data:{user:state.target},error:null}));
  state.rpc.mockReset().mockImplementation(async(name)=>({data:name==="begin_password_recovery"?{execute:state.execute,status:"PENDING"}:null,error:null}));
});
function app() {
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:state.member,error:state.queryError})};req.auth={user:{id:"actor"} as any,accessToken:"fixture",client:{from:()=>q,rpc:state.rpc} as any};next();});
  app.use(router);app.use(((err:any,_req:any,res:any,_next:any)=>res.status(err.status??500).json({error:{code:err.code}})) as express.ErrorRequestHandler);return app;
}
const id="70000000-0000-4000-8000-000000000001",body={operation_id:"70000000-0000-4000-8000-000000000002",reason:"Verified operator request"};
describe("single-account recovery",()=>{
  it("rejects legacy bulk reset and password input",async()=>{
    await request(app()).post(`/schools/${id}/reset-admin-password`).send({password:"password123"}).expect(422);
    await request(app()).post(`/iam/${id}/reset-password`).send({...body,password:"password123"}).expect(422);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not recover an absent/unverified target or hide a query failure",async()=>{
    state.member=null;await request(app()).post(`/iam/${id}/reset-password`).send(body).expect(404);
    state.member={user_id:"u",school_id:"s"};state.target.email_confirmed_at=null;
    await request(app()).post(`/iam/${id}/reset-password`).send(body).expect(422);
    state.queryError={code:"XX000",message:"failure"};await request(app()).post(`/iam/${id}/reset-password`).send(body).expect(500);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("persists intent before sending and returns no secret",async()=>{
    const response=await request(app()).post(`/iam/${id}/reset-password`).send(body).expect(202);
    expect(state.rpc.mock.calls[0]![0]).toBe("begin_password_recovery");
    expect(state.rpc.mock.invocationCallOrder[0]).toBeLessThan(state.send.mock.invocationCallOrder[0]!);
    expect(state.send).toHaveBeenCalledOnce();expect(JSON.stringify(response.body)).not.toContain("password123");
    expect(response.body.data.status).toBe("SUCCEEDED");
  });
  it("does not resend an operation whose outcome is pending or unknown",async()=>{
    state.execute=false;await request(app()).post(`/iam/${id}/reset-password`).send(body).expect(202);expect(state.send).not.toHaveBeenCalled();
  });
  it("records ambiguous provider failure without a false success",async()=>{
    state.send.mockRejectedValue(new Error("network timeout"));const response=await request(app()).post(`/iam/${id}/reset-password`).send(body).expect(202);
    expect(response.body.data.status).toBe("UNKNOWN");expect(state.rpc).toHaveBeenCalledWith("finish_password_recovery",{p_id:body.operation_id,p_status:"UNKNOWN"});
  });
});
