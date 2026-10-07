// Mounted after requirePortalSession. No customer identifier from the request
// body/query is ever used to choose the account these endpoints can access.
const express=require('express');
const P=require('../utils/portalLeads');
const cal=require('../utils/calendar');
const router=express.Router();
const actor=req=>'Customer portal: '+(req.portalClient.portal_username||req.portalClient.company||req.portalClient.id);
router.get('/workspace-insights',async(req,res)=>res.json(await require('../utils/workspaceInsights').workspaceInsights({client:req.portalClient,days:req.query.days||'30'})));
router.get('/leads',async(req,res)=>res.json(await P.listLeads(req.portalClient,req.query)));
router.post('/leads',async(req,res)=>{
  const saved=await P.createLead(req.portalClient.id,req.body||{},actor(req));
  res.status(saved.created?201:200).json(saved);
});
router.get('/leads/:id',async(req,res)=>res.json(await P.detail(req.portalClient,req.params.id)));
router.patch('/leads/:id',async(req,res)=>res.json(await P.updateLead(req.portalClient,req.params.id,req.body||{},actor(req))));
router.get('/calendar',async(req,res)=>res.json(await P.listEvents(req.portalClient,req.query)));
router.get('/calendar/export',async(req,res)=>res.type('text/calendar').set('Content-Disposition','attachment; filename="my-meetings.ics"').send(cal.ics(await P.listEvents(req.portalClient,req.query))));
router.post('/calendar',async(req,res)=>{
  const saved=await P.createEvent(req.portalClient,req.body||{},actor(req));
  res.status(saved.created?201:200).json(saved);
});
router.patch('/calendar/:id',async(req,res)=>res.json(await P.updateEvent(req.params.id,req.body||{},actor(req),req.portalClient.id)));
module.exports=router;
