const express=require('express');
const db=require('../db');
const cal=require('../utils/calendar');
const router=express.Router();
const actor=req=>req.user ? req.user.email : req.authKind==='breakglass' ? `Emergency session ${req.breakglass.id}` : 'Admin key';
router.get('/',async(req,res)=>res.json(await cal.listEvents(req.query)));
router.get('/export',async(req,res)=>{
  res.type('text/calendar').set('Content-Disposition','attachment; filename="vantriq-calendar.ics"')
    .send(cal.ics(await cal.listEvents(req.query)));
});
router.post('/',async(req,res)=>{
  const saved=await cal.createEvent(req.body||{},actor(req));
  res.status(saved.created?201:200).json(saved);
});
router.patch('/:id',async(req,res)=>{
  const eventId=cal.id(req.params.id),body=req.body||{};
  const {rows: linked}=await db.query(`select e.id from calendar_events e join portal_leads l
    on (l.id=e.portal_lead_id or (e.portal_lead_id is null and l.crm_client_id=e.client_id)) where e.id=$1`,[eventId]);
  if(linked.length)return res.json(await require('../utils/portalLeads').updateEvent(eventId,body,actor(req)));
  if (Object.keys(body).some(k=>!['title','starts_at','ends_at','kind','status','location','notes'].includes(k)))
    cal.fail(400,'Only appointment details may be changed.');
  const saved=await cal.transaction(async conn=>{
    const {rows}=await conn.query(`select e.*,c.owner_rep_id from calendar_events e join clients c on c.id=e.client_id where e.id=$1 for update of e`,[eventId]);
    const old=rows[0];if(!old) cal.fail(404,'Appointment not found.');
    const e=cal.eventInput({...old,starts_at:new Date(old.starts_at).toISOString(),ends_at:new Date(old.ends_at).toISOString(),...body});
    await cal.conflict(conn,{id:old.client_id,owner_rep_id:old.owner_rep_id},e,eventId);
    return (await conn.query(`update calendar_events set title=$2,starts_at=$3,ends_at=$4,kind=$5,status=$6,location=$7,notes=$8,updated_at=now() where id=$1 returning *`,
      [eventId,e.title,e.starts_at,e.ends_at,e.kind,e.status,e.location,e.notes])).rows[0];
  });res.json(saved);
});
module.exports=router;
