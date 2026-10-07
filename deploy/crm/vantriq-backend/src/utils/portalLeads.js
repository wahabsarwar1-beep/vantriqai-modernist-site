const db = require('../db');
const cal = require('./calendar');
const C = require('./contacts');
const STATUSES = ['new','contacted','qualified','proposal','negotiation','won','lost'];
const ACTIVE = ['scheduled','confirmed'];
const CRM_STAGE = {new:'lead',contacted:'contacted',qualified:'contacted',proposal:'proposal',negotiation:'negotiation',won:'active',lost:'lost'};
const CRM_STATUS = `case c.stage when 'lead' then 'new' when 'active' then 'won' when 'churned' then 'lost' else c.stage end`;
function text(v,max=200) { if(typeof v!=='string') cal.fail(400,'Text fields must contain text.'); if(v.length>max) cal.fail(400,'A text field is too long.'); return v.trim(); }
function contactKey(b) {
  const key = b.contact_key || C.phoneDigits(b.phone) || C.keyOf(b.session_id) || b.external_ref || (b.email && b.email.toLowerCase());
  if(typeof key!=='string'||!key.trim()||key.length>200) cal.fail(400,'A contact reference, phone or email is required.');
  return key.trim();
}
async function history(conn,leadId,eventId,action,actor,details) {
  await conn.query('insert into portal_lead_history(lead_id,event_id,action,actor,details) values($1,$2,$3,$4,$5::jsonb)',[leadId,eventId,action,actor,JSON.stringify(details)]);
}
// Only the internal company's session can bridge its pre-existing sales pipeline.
// Ordinary customer accounts never query, import or edit another client's rows.
async function syncInternal(client) {
  if(!client.is_internal) return;
  await db.query(`insert into portal_leads(client_id,crm_client_id,contact_key,name,company,email,phone,source,status,notes)
    select $1,c.id,'crm:'||c.id,c.name,c.company,coalesce(c.email,''),coalesce(c.phone,''),coalesce(c.source,'manual'),${CRM_STATUS},coalesce(c.notes,'')
    from clients c where c.id<>$1 and not c.is_internal
    on conflict(crm_client_id) do nothing`,[client.id]);
}
const LEADS = `select count(*) over() as total_count,l.*,coalesce(c.name,l.name) as name,coalesce(c.company,l.company) as company,
  coalesce(c.email,l.email) as email,coalesce(c.phone,l.phone) as phone,coalesce(c.notes,l.notes) as notes,
  case when c.id is null then l.status else ${CRM_STATUS} end as status,
  coalesce(r.name,nullif(l.assigned_to,''),'') as assigned_to
  from portal_leads l left join clients c on c.id=l.crm_client_id left join sales_reps r on r.id=c.owner_rep_id`;
async function listLeads(client,q={}) {
  await syncInternal(client);
  const p=[client.id]; let w='where l.client_id=$1';
  if(q.q){p.push('%'+text(q.q,200)+'%');w+=` and (l.name ilike $${p.length} or l.company ilike $${p.length} or l.phone ilike $${p.length} or l.email ilike $${p.length} or c.name ilike $${p.length})`;}
  if(q.status){if(!STATUSES.includes(q.status))cal.fail(400,'Choose a valid lead status.');p.push(q.status);w+=` and (case when c.id is null then l.status else ${CRM_STATUS} end)=$${p.length}`;}
  const limit=Math.min(100,Math.max(1,Number(q.limit)||50)),offset=Math.max(0,Number(q.offset)||0);
  if(!Number.isInteger(limit)||!Number.isInteger(offset))cal.fail(400,'Invalid page.');
  p.push(limit,offset);
  const leads=(await db.query(`${LEADS} ${w} order by l.updated_at desc,l.id limit $${p.length-1} offset $${p.length}`,p)).rows;
  const total=leads.length?Number(leads[0].total_count):0;
  const stats=(await db.query(`select count(*)::int as total,
    count(*) filter(where status not in ('won','lost'))::int as open,
    count(*) filter(where status='won')::int as won,
    count(*) filter(where status not in ('won','lost') and next_action_at<now())::int as due,
    count(*) filter(where status not in ('won','lost') and assigned_to='')::int as unassigned
    from (select case when c.id is null then l.status else ${CRM_STATUS} end as status,
      l.next_action_at,coalesce(r.name,nullif(l.assigned_to,''),'') as assigned_to
      from portal_leads l left join clients c on c.id=l.crm_client_id left join sales_reps r on r.id=c.owner_rep_id
      where l.client_id=$1) account_leads`,[client.id])).rows[0];
  leads.forEach(l=>delete l.total_count);return {leads,total,limit,offset,summary:stats};
}
async function findLead(conn,tenant,id,lock=false) {
  cal.id(id);
  const {rows}=await conn.query(`select l.* from portal_leads l where l.client_id=$1 and l.id=$2${lock?' for update':''}`,[tenant,id]);
  if(!rows[0])cal.fail(404,'Lead not found.');return rows[0];
}
async function createLead(tenant,b,actor,automatic=false) {
  const key=contactKey(b), f={};
  for(const [k,max] of [['name',160],['company',200],['email',200],['phone',40],['notes',4000],['source',120]])f[k]=b[k]===undefined?'':text(b[k],max);
  f.source=f.source||b.channel||'manual';
  if(f.email&& !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))cal.fail(400,'Enter a valid email address.');
  return cal.transaction(async conn=>{
    const {rows}=await conn.query('select * from portal_leads where client_id=$1 and contact_key=$2 for update',[tenant,key]);
    if(rows[0]){
      if(automatic){
        // Retry can fill blanks but cannot reset ownership, stage or human notes.
        await conn.query(`update portal_leads set name=case when name='' then $3 else name end,
          company=case when company='' then $4 else company end,email=case when email='' then $5 else email end,
          phone=case when phone='' then $6 else phone end,notes=case when notes='' then $7 else notes end,updated_at=now()
          where client_id=$1 and id=$2`,[tenant,rows[0].id,f.name,f.company,f.email,f.phone,f.notes]);
      }
      return {lead:await findLead(conn,tenant,rows[0].id),created:false};
    }
    const saved=(await conn.query(`insert into portal_leads(client_id,contact_key,name,company,email,phone,source,notes)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[tenant,key,f.name,f.company,f.email,f.phone,f.source,f.notes])).rows[0];
    await history(conn,saved.id,null,'lead_created',actor,{source:f.source});
    return {lead:saved,created:true};
  },tenant);
}
async function updateLead(client,id,b,actor) {
  const allowed=['name','company','email','phone','notes','status','assigned_to','next_action','next_action_at'];
  if(Object.keys(b).some(k=>!allowed.includes(k)))cal.fail(400,'Only lead details may be changed.');
  return cal.transaction(async conn=>{
    const old=await findLead(conn,client.id,id,true),values={};
    for(const k of Object.keys(b))values[k]=k==='next_action_at' ? (b[k]?cal.instant(b[k]):null) : text(b[k],k==='notes'?4000:k==='phone'?40:200);
    if(values.status&&!STATUSES.includes(values.status))cal.fail(400,'Choose a valid lead status.');
    if(values.status==='')cal.fail(400,'Choose a valid lead status.');
    if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))cal.fail(400,'Enter a valid email address.');
    if(old.crm_client_id && !client.is_internal)cal.fail(403,'This lead is not available.');
    // Winning an internal Vantriq deal has billing side effects. Keep that action in CRM.
    if(old.crm_client_id && Object.hasOwn(values,'assigned_to') && values.assigned_to!==old.assigned_to)cal.fail(400,'Assign this Vantriq sales lead to a sales rep in the CRM.');
    if(old.crm_client_id && values.status==='won')cal.fail(400,'Activate this account in the CRM after confirming its billing details.');
    if(values.assigned_to){
      const clash=(await conn.query(`select a.id from calendar_events a join portal_leads la on la.id=a.portal_lead_id
        join calendar_events b on a.starts_at<b.ends_at and a.ends_at>b.starts_at
        join portal_leads lb on lb.id=b.portal_lead_id
        where la.id=$1 and la.client_id=$2 and lb.client_id=$2 and lb.id<>$1 and lb.assigned_to=$3
        and a.status in ('scheduled','confirmed') and b.status in ('scheduled','confirmed') and a.ends_at>now() limit 1`,[id,client.id,values.assigned_to])).rows;
      if(clash.length)cal.fail(409,'That owner has a conflicting appointment. Reschedule before assigning.');
    }
    const entries=Object.entries(values); if(!entries.length)return old;
    const saved=(await conn.query(`update portal_leads set ${entries.map(([k],i)=>`${k}=$${i+3}`).join(',')},updated_at=now() where client_id=$1 and id=$2 returning *`,[client.id,id,...entries.map(([,v])=>v)])).rows[0];
    if(old.crm_client_id){
      const fields=entries.filter(([k])=>['name','company','email','phone','notes','status'].includes(k)).map(([k,v])=>[k==='status'?'stage':k,k==='status'?CRM_STAGE[v]:v]);
      if(fields.length){
        await conn.query(`update clients set ${fields.map(([k],i)=>`${k}=$${i+2}`).join(',')},updated_at=now() where id=$1`,[old.crm_client_id,...fields.map(([,v])=>v)]);
        if(values.status)await conn.query('insert into client_stage_history(client_id,from_stage,to_stage,comment) values($1,null,$2,$3)',[old.crm_client_id,CRM_STAGE[values.status],'Updated in own company portal']);
      }
    }
    const changed={};for(const [k,v] of entries)if(String(old[k]??'')!==String(v??''))changed[k]={from:old[k],to:v};
    if(Object.keys(changed).length)await history(conn,id,null,'lead_updated',actor,changed);
    return saved;
  },client.is_internal?null:client.id);
}
const EVENTS = `select e.*,l.id as lead_id,coalesce(pc.name,l.name) as lead_name,coalesce(pc.company,l.company) as company,coalesce(pr.name,nullif(l.assigned_to,''),'') as rep_name,
 l.contact_key,l.phone,l.email from calendar_events e join portal_leads l
 on (e.portal_lead_id=l.id or (e.portal_lead_id is null and e.client_id=l.crm_client_id))
 left join clients pc on pc.id=l.crm_client_id left join sales_reps pr on pr.id=pc.owner_rep_id`;
async function listEvents(client,q) {
  await syncInternal(client);
  const from=cal.instant(q.from),to=cal.instant(q.to);
  if(Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>93*86400000)cal.fail(400,'Choose a calendar range of up to 93 days.');
  const p=[client.id,from,to];let w='where l.client_id=$1 and e.ends_at>$2 and e.starts_at<$3';
  if(q.channel){if(!['manual',...cal.AGENT_CHANNELS].includes(q.channel))cal.fail(400,'Choose a valid channel.');p.push(q.channel);w+=` and e.channel=$${p.length}`;}
  if(q.status){if(!['scheduled','confirmed','completed','cancelled','no_show'].includes(q.status))cal.fail(400,'Choose a valid appointment status.');p.push(q.status);w+=` and e.status=$${p.length}`;}
  return (await db.query(`${EVENTS} ${w} order by e.starts_at,e.id`,p)).rows;
}
async function eventConflict(conn,tenant,lead,e,exclude=null) {
  if(!ACTIVE.includes(e.status))return;
  if(lead.crm_client_id)await cal.conflict(conn,{id:lead.crm_client_id,owner_rep_id:(await conn.query('select owner_rep_id from clients where id=$1',[lead.crm_client_id])).rows[0]?.owner_rep_id},e,exclude);
  const {rows}=await conn.query(`${EVENTS} where l.client_id=$1 and e.status in ('scheduled','confirmed')
    and ($6::uuid is null or e.id<>$6) and (l.id=$2 or ($3<>'' and l.assigned_to=$3)) and e.starts_at<$5 and e.ends_at>$4 limit 1`,[tenant,lead.id,lead.assigned_to,e.starts_at,e.ends_at,exclude]);
  if(rows.length)cal.fail(409,'This lead or owner already has an appointment in that time slot.');
}
async function createEvent(client,b,actor,automatic=false) {
  const e=cal.eventInput(b,automatic);
  // Providers reuse booking ids across businesses. Namespace by the server-resolved tenant.
  if(e.external_id)e.external_id=client.id+':'+e.external_id;
  return cal.transaction(async conn=>{
    const lead=await findLead(conn,client.id,b.lead_id||b.portal_lead_id,true);
    if(e.external_id){
      const old=(await conn.query(`select e.* from calendar_events e where e.channel=$1 and e.external_id=$2`,[e.channel,e.external_id])).rows[0];
      if(old){
        if((old.portal_lead_id===lead.id || (lead.crm_client_id&&old.client_id===lead.crm_client_id))&&new Date(old.starts_at).toISOString()===e.starts_at&&new Date(old.ends_at).toISOString()===e.ends_at&&old.title===e.title&&old.kind===e.kind&&old.notes===e.notes&&old.location===e.location)return {event:old,created:false};
        cal.fail(409,'That booking reference already exists with different details.');
      }
    }
    await eventConflict(conn,client.id,lead,e);
    const saved=(await conn.query(`insert into calendar_events(client_id,portal_lead_id,title,starts_at,ends_at,channel,kind,status,location,notes,external_id,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,[lead.crm_client_id||client.id,lead.crm_client_id?null:lead.id,e.title,e.starts_at,e.ends_at,e.channel,e.kind,e.status,e.location,e.notes,e.external_id||null,actor])).rows[0];
    await history(conn,lead.id,saved.id,'meeting_booked',actor,{title:e.title,starts_at:e.starts_at,status:e.status});
    return {event:saved,created:true};
  },client.is_internal?null:client.id);
}
async function updateEvent(eventId,b,actor,tenant=null) {
  cal.id(eventId);
  if(Object.keys(b).some(k=>!['title','starts_at','ends_at','kind','status','location','notes','outcome'].includes(k)))cal.fail(400,'Only appointment details may be changed.');
  const scope=(await db.query(`select l.client_id,c.is_internal from calendar_events e join portal_leads l
    on (e.portal_lead_id=l.id or (e.portal_lead_id is null and e.client_id=l.crm_client_id))
    join clients c on c.id=l.client_id where e.id=$1${tenant?' and l.client_id=$2':''}`,tenant?[eventId,tenant]:[eventId])).rows[0];
  if(!scope)cal.fail(404,'Appointment not found.');
  return cal.transaction(async conn=>{
    const old=(await conn.query(`${EVENTS} where e.id=$1${tenant?' and l.client_id=$2':''} for update of e`,tenant?[eventId,tenant]:[eventId])).rows[0];
    if(!old)cal.fail(404,'Appointment not found.');
    const lead=(await conn.query('select * from portal_leads where id=$1',[old.lead_id])).rows[0];
    const {outcome,...input}=b;
    const e=cal.eventInput({...old,starts_at:new Date(old.starts_at).toISOString(),ends_at:new Date(old.ends_at).toISOString(),...input});
    await eventConflict(conn,lead.client_id,lead,e,eventId);
    const saved=(await conn.query(`update calendar_events set title=$2,starts_at=$3,ends_at=$4,kind=$5,status=$6,location=$7,notes=$8,updated_at=now() where id=$1 returning *`,[eventId,e.title,e.starts_at,e.ends_at,e.kind,e.status,e.location,e.notes])).rows[0];
    const action=e.starts_at!==new Date(old.starts_at).toISOString()||e.ends_at!==new Date(old.ends_at).toISOString()?'meeting_rescheduled':'meeting_updated';
    await history(conn,lead.id,eventId,action,actor,{title:e.title,from_status:old.status,status:e.status,from_starts_at:old.starts_at,starts_at:e.starts_at,ends_at:e.ends_at,notes:e.notes,location:e.location,outcome:outcome===undefined?'':text(outcome,2000)});
    return saved;
  },scope.is_internal?null:scope.client_id);
}
async function detail(client,id) {
  await syncInternal(client);await findLead(db,client.id,id);
  const lead=(await db.query(`${LEADS} where l.client_id=$1 and l.id=$2`,[client.id,id])).rows[0];
  const appointments=(await db.query(`${EVENTS} where l.client_id=$1 and l.id=$2 order by e.starts_at desc`,[client.id,id])).rows;
  const activity=(await db.query('select * from portal_lead_history where lead_id=$1 order by created_at desc,id desc limit 200',[id])).rows;
  return {lead,appointments,history:activity};
}
async function resolveTenant(body) {
  if(!body.agent_ref&&!body.agent_id&&!body.tenant_client_id)cal.fail(400,'An agent_ref, agent_id or tenant_client_id is required for customer lead capture.');
  let tenant=body.tenant_client_id?cal.id(body.tenant_client_id):null;
  if(body.agent_ref||body.agent_id){
    const rows=(await db.query('select client_id from client_agents where '+(body.agent_id?'id=$1':'external_ref=$1'),[body.agent_id?cal.id(body.agent_id):text(body.agent_ref,200)])).rows;
    if(!rows[0])cal.fail(404,'Agent not found.');if(tenant&&tenant!==rows[0].client_id)cal.fail(400,'Agent does not belong to this customer.');tenant=rows[0].client_id;
  }
  const client=(await db.query('select id,is_internal from clients where id=$1',[tenant])).rows[0];
  if(!client)cal.fail(404,'Customer not found.');return client;
}
module.exports={STATUSES,syncInternal,listLeads,createLead,updateLead,listEvents,createEvent,updateEvent,detail,resolveTenant};
