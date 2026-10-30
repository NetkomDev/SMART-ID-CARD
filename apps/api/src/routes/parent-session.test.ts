import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
let router: express.Router, seal: (value: any) => string, read: (req: any) => any, guard: express.RequestHandler;
beforeAll(async () => {
  process.env.SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_ANON_KEY="fixture";process.env.SESSION_COOKIE_KEY="test-only-session-key-with-at-least-32-characters";
  const module=await import("./parent-session.js");router=module.parentSessionRouter;seal=module.sealSession;read=module.readParentSession;guard=module.parentCookieAuth;
});
const saved={access_token:"access-secret",refresh_token:"refresh-secret",csrf:"csrf-fixture"};
function app(){const app=express();app.use(express.json());app.use("/session",router);app.post("/write",guard,(req,res)=>res.json({authorization:req.headers.authorization}));app.use(((err:any,_req:any,res:any,_next:any)=>res.status(err.status??500).json({error:{code:err.code}})) as express.ErrorRequestHandler);return app;}
describe("encrypted HttpOnly parent sessions and CSRF",()=>{
  it("encrypts tokens and rejects tampered ciphertext",()=>{
    const cookie=seal(saved);expect(cookie).not.toContain("access-secret");expect(read({headers:{cookie:`aksis_parent_v2=${cookie}`}})).toEqual(saved);
    const bytes=Buffer.from(cookie,"base64url");bytes[30]^=1;expect(read({headers:{cookie:`aksis_parent_v2=${bytes.toString("base64url")}`}})).toBeNull();
  });
  it("rejects a browser write without an allowed Origin",async()=>{
    await request(app()).post("/write").set("cookie",`aksis_parent_v2=${seal(saved)}`).set("x-csrf-token",saved.csrf).expect(403);
    await request(app()).post("/write").set("cookie",`aksis_parent_v2=${seal(saved)}`).set("origin","https://evil.test").set("x-csrf-token",saved.csrf).expect(403);
  });
  it("rejects an allowed-origin write with missing/wrong CSRF",async()=>{
    for(const csrf of ["","wrong"]) await request(app()).post("/write").set("origin","http://localhost:4173").set("cookie",`aksis_parent_v2=${seal(saved)}`).set("x-csrf-token",csrf).expect(403);
  });
  it("forwards only the decrypted user token when both checks pass",async()=>{
    const res=await request(app()).post("/write").set("origin","http://localhost:4173").set("cookie",`aksis_parent_v2=${seal(saved)}`).set("x-csrf-token",saved.csrf).expect(200);
    expect(res.body.authorization).toBe("Bearer access-secret");
  });
  it("requires a session to bootstrap CSRF and never returns access/refresh tokens",async()=>{
    await request(app()).get("/session/csrf").expect(401);
    const res=await request(app()).get("/session/csrf").set("cookie",`aksis_parent_v2=${seal(saved)}`).expect(200);
    expect(res.body.data).toEqual({csrf:saved.csrf});expect(res.headers["cache-control"]).toBe("no-store");
  });
});
