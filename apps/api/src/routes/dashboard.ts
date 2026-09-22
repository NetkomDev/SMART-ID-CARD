import{Router}from"express";import{fromDatabaseError}from"../lib/errors.js";import{sendData}from"../lib/responses.js";import{asyncHandler}from"../middleware/async-handler.js";import{requirePermission}from"../middleware/tenant.js";
const router=Router();
router.get("/today",requirePermission("dashboard.read"),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.rpc("get_dashboard_today",{target_school_id:req.tenant!.schoolId});if(error)throw fromDatabaseError(error);res.setHeader("cache-control","private, no-store");sendData(res,data)}));
export{router as dashboardRouter};
