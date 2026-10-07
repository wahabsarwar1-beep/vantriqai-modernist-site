const express=require('express');
const {workspaceInsights}=require('../utils/workspaceInsights');
const router=express.Router();
// Mounted behind the same staff gate as the CRM dashboard. Portal access
// uses a different route and never accepts scope or client_id from a request.
router.get('/',async(req,res)=>res.json(await workspaceInsights({scope:req.query.scope||'sales',clientId:req.query.client_id||null,days:req.query.days||'30'})));
module.exports=router;
