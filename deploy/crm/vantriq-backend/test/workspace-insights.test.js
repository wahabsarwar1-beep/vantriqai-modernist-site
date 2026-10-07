// Real PostgreSQL aggregation and HTTP guards in an isolated database.
const assert=require('node:assert/strict');
const fs=require('node:fs');const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');const express=require('express');
const pg=new PGlite();const db={query:(s,p)=>pg.query(s,p)};
require.cache[require.resolve('../src/db')]={exports:db};
const {workspaceInsights}=require('../src/utils/workspaceInsights');
const {requirePortalSession}=require('../src/middleware/portalAuth');
const {requireScope}=require('../src/middleware/auth');
const {errorHandler}=require('../src/utils/asyncErrors');
const now=new Date('2026-10-07T12:00:00Z'),a=randomUUID(),b=randomUUID(),own=randomUUID();
let server;
(async()=>{
  await pg.exec(`create table clients(id uuid primary key,stage text,source text,is_internal boolean,company text,created_at timestamptz);
    create table portal_leads(id uuid primary key,client_id uuid references clients(id),crm_client_id uuid,status text,source text,created_at timestamptz,next_action_at timestamptz);
    create table calendar_events(id uuid primary key,client_id uuid,portal_lead_id uuid,status text,starts_at timestamptz,ends_at timestamptz);
    create table portal_sessions(token text,client_id uuid,expires_at timestamptz,last_seen_at timestamptz);
    create table internal_users(id uuid,email text,name text,role text,active boolean,must_change_password boolean,is_owner boolean);
    create table staff_sessions(token text,user_id uuid,expires_at timestamptz,last_seen_at timestamptz);`);
  for(const [id,internal] of [[a,false],[b,false],[own,true]])await pg.query("insert into clients values($1,'lead','website',$2,'Business',$3)",[id,internal,now.toISOString()]);
  async function lead(tenant,status,age,source='website',crm=null){const id=randomUUID();await pg.query('insert into portal_leads values($1,$2,$3,$4,$5,$6,$7)',[id,tenant,crm,status,source,new Date(+now-age*86400000).toISOString(),age===65?new Date(+now-86400000).toISOString():null]);return id;}
  const won=await lead(a,'won',2),contact=await lead(a,'contacted',4,'whatsapp'),old=await lead(a,'new',65),proposal=await lead(a,'proposal',20),lost=await lead(a,'lost',3),older=await lead(a,'qualified',40);
  await lead(b,'won',1,'secret-other-source');
  await lead(own,'new',1,'manual');
  await lead(own,'won',1,'bridge',a); // A bridge is never counted twice.
  async function event(tenant,l,status,start,end){await pg.query('insert into calendar_events values($1,$2,$3,$4,$5,$6)',[randomUUID(),tenant,l,status,start,end]);}
  await event(a,won,'completed','2026-10-06T09:00:00Z','2026-10-06T10:00:00Z');
  await event(a,contact,'no_show','2026-10-05T09:00:00Z','2026-10-05T10:00:00Z');
  await event(a,proposal,'cancelled','2026-10-04T09:00:00Z','2026-10-04T10:00:00Z');
  await event(a,old,'scheduled','2026-10-03T09:00:00Z','2026-10-03T10:00:00Z');
  await event(a,contact,'scheduled','2026-10-07T13:00:00Z','2026-10-07T14:00:00Z');
  await event(b,null,'completed','2026-10-06T09:00:00Z','2026-10-06T10:00:00Z'); // Vantriq sales event
  const bl=(await pg.query('select id from portal_leads where client_id=$1',[b])).rows[0].id;
  await event(b,bl,'completed','2026-10-06T09:00:00Z','2026-10-06T10:00:00Z');
  const one=await workspaceInsights({client:{id:a,is_internal:false},now});
  assert.equal(one.summary.leads,4);assert.equal(one.summary.won,1);assert.equal(one.summary.won_share,25);
  assert.equal(one.summary.engaged,3);assert.equal(one.summary.proposed,2);assert.equal(one.summary.lost,1);
  assert.equal(one.pipeline.open,4);assert.equal(one.pipeline.due,1);
  assert.deepEqual([one.pipeline.age_0_7,one.pipeline.age_8_30,one.pipeline.age_31_60,one.pipeline.age_61_plus],[1,1,1,1]);
  assert.equal(one.appointments.total,5);assert.equal(one.appointments.ended,3);assert.equal(one.appointments.completed_ended,1);assert.equal(one.appointments.completion_rate,33.3);
  assert.equal(one.appointments.overdue,1);assert.equal(one.trend.reduce((s,v)=>s+v.total,0),5);
  assert.equal(one.sources.some(v=>v.source==='secret-other-source'),false);
  const spoof=await workspaceInsights({client:{id:a,is_internal:false},scope:'sales',clientId:b,now});assert.deepEqual(spoof,one);
  const all=await workspaceInsights({scope:'customers',now});assert.equal(all.summary.leads,5);assert.equal(all.appointments.total,6);
  const filtered=await workspaceInsights({scope:'customers',clientId:a,now});assert.deepEqual(filtered,one);
  const sales=await workspaceInsights({scope:'sales',now});assert.equal(sales.summary.leads,3);assert.equal(sales.appointments.total,1);assert.equal(sales.sources.some(v=>v.source==='bridge'),false);
  const seven=await workspaceInsights({client:{id:a,is_internal:false},days:7,now});assert.equal(seven.summary.leads,3);assert.equal(seven.trend.length,7);
  assert.deepEqual(seven.period,{from:'2026-10-01',to:'2026-10-07',timezone:'Asia/Karachi',trend_grain:'day'});
  await assert.rejects(()=>workspaceInsights({days:'1000'}),e=>e.status===400);
  await assert.rejects(()=>workspaceInsights({scope:'unknown'}),e=>e.status===400);
  await assert.rejects(()=>workspaceInsights({scope:'customers',clientId:'injected'}),e=>e.status===400);
  const empty=await workspaceInsights({scope:'customers',clientId:randomUUID(),now});assert.equal(empty.summary.won_share,null);assert.equal(empty.appointments.completion_rate,null);assert.equal(empty.pipeline.open,0);
  await pg.query("insert into portal_sessions values('portal-a',$1,now()+interval '1 day',null)",[a]);
  const staff=randomUUID();await pg.query("insert into internal_users values($1,'staff@example.test','Staff','staff',true,false,false)",[staff]);await pg.query("insert into staff_sessions values('staff',$1,now()+interval '1 day',null)",[staff]);
  const app=express();app.use('/api/portal',requirePortalSession,require('../src/routes/portalWorkspace'));
  app.use('/api/workspace-insights',requireScope('staff'),require('../src/routes/workspaceInsights'));app.use(errorHandler);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const url='http://127.0.0.1:'+server.address().port;
  async function get(path,token){const r=await fetch(url+path,{headers:token?{authorization:'Bearer '+token}:{}});return {status:r.status,data:await r.json()};}
  assert.equal((await get('/api/portal/workspace-insights')).status,401);
  assert.equal((await get('/api/workspace-insights')).status,401);
  assert.equal((await get('/api/workspace-insights','portal-a')).status,401);
  assert.equal((await get('/api/workspace-insights?scope=customers','staff')).status,200);
  const http=await get('/api/portal/workspace-insights?scope=customers&client_id='+b,'portal-a');assert.equal(http.status,200);assert.equal(http.data.sources.some(v=>v.source==='secret-other-source'),false);
  console.log('Workspace insights passed: exact cohort/funnel/source counts, all-time ageing, completion denominator, PKT periods, zero-filled trends, platform/customer scope, no bridge duplicates, empty state and real HTTP access guards.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));await pg.close();});
