const db = require('../db');
// The agents that can book a discovery call. 'facebook' is Messenger.
const AGENT_CHANNELS = ['website', 'whatsapp', 'instagram', 'facebook'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status, message) { const e = new Error(message); e.status = status; e.expose = true; throw e; }
function id(value) { if (!UUID.test(value || '')) fail(400, 'A valid record id is required.'); return value; }
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    fail(400, 'Dates must include a timezone, for example 2026-10-03T10:00:00+05:00.');
  const [year,month,day,hour,minute] = value.match(/^\d{4}|\d{2}/g).slice(0,5).map(Number);
  if(month<1 || month>12 || day<1 || day>new Date(Date.UTC(year,month,0)).getUTCDate() || hour>23 || minute>59)
    fail(400,'The date or time is not valid.');
  return new Date(value).toISOString();
}
function eventInput(body, webhook = false) {
  const out = {};
  for (const [key, max] of [['title',200],['location',500],['notes',4000],['external_id',200]]) {
    const v = body[key];
    if (v !== undefined && typeof v !== 'string') fail(400, `${key} must be text.`);
    if (v && v.length > max) fail(400, `${key} is too long.`);
    out[key] = (v || '').trim();
  }
  if (!out.title) fail(400, 'A title is required.');
  out.starts_at = instant(body.starts_at); out.ends_at = instant(body.ends_at);
  const duration = Date.parse(out.ends_at) - Date.parse(out.starts_at);
  if (duration <= 0 || duration > 86400000) fail(400, 'An appointment must last between 1 millisecond and 24 hours.');
  out.channel = body.channel || 'manual'; out.kind = body.kind || 'meeting'; out.status = body.status || 'scheduled';
  if (!(webhook ? AGENT_CHANNELS : ['manual', ...AGENT_CHANNELS]).includes(out.channel)) fail(400, 'Choose a valid channel.');
  if (!['meeting','demo','call','follow_up'].includes(out.kind)) fail(400, 'Choose a valid appointment kind.');
  if (!['scheduled','completed','cancelled','no_show'].includes(out.status)) fail(400, 'Choose a valid status.');
  if (webhook && (!out.external_id || out.status !== 'scheduled')) fail(400, 'Agent bookings need a stable external_id and scheduled status.');
  return out;
}
async function transaction(work) {
  const conn = await db.pool.connect();
  try {
    await conn.query('begin');
    // All calendar and ownership writes share a lock, preventing bookings or
    // reassignments racing past the availability check. Fine for this CRM's scale.
    await conn.query('select pg_advisory_xact_lock(92323001)');
    const result = await work(conn);
    await conn.query('commit'); return result;
  } catch (e) { await conn.query('rollback'); throw e; } finally { conn.release(); }
}
async function conflict(conn, client, e, exclude = null) {
  if (e.status !== 'scheduled') return;
  const { rows } = await conn.query(`select e.id from calendar_events e join clients c on c.id=e.client_id
    where e.status='scheduled' and ($5::uuid is null or e.id<>$5)
    and (e.client_id=$1 or ($2::uuid is not null and c.owner_rep_id=$2))
    and e.starts_at < $4 and e.ends_at > $3 limit 1`,
    [client.id, client.owner_rep_id, e.starts_at, e.ends_at, exclude]);
  if (rows.length) fail(409, 'This lead or sales rep already has an appointment in that time slot.');
}
async function createEvent(body, actor, webhook = false) {
  const e = eventInput(body, webhook);
  if (!body.client_id && !body.external_ref) fail(400, 'client_id or external_ref is required.');
  if (body.client_id) id(body.client_id);
  return transaction(async conn => {
    const { rows } = await conn.query(body.client_id ? 'select id, owner_rep_id from clients where id=$1' :
      'select id, owner_rep_id from clients where external_ref=$1', [body.client_id || body.external_ref]);
    const client = rows[0]; if (!client) fail(404, 'Lead not found. Capture the lead before booking.');
    if (e.external_id) {
      const { rows: old } = await conn.query('select * from calendar_events where channel=$1 and external_id=$2', [e.channel,e.external_id]);
      if (old[0]) {
        if (old[0].client_id !== client.id || new Date(old[0].starts_at).toISOString() !== e.starts_at ||
            new Date(old[0].ends_at).toISOString() !== e.ends_at || old[0].title !== e.title ||
            old[0].kind !== e.kind || old[0].location !== e.location || old[0].notes !== e.notes)
          fail(409, 'That booking reference already exists with different details.');
        return { event:old[0], created:false };
      }
    }
    await conflict(conn, client, e);
    const { rows: saved } = await conn.query(`insert into calendar_events
      (client_id,title,starts_at,ends_at,channel,kind,status,location,notes,external_id,created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [client.id,e.title,e.starts_at,e.ends_at,e.channel,e.kind,e.status,e.location,e.notes,e.external_id||null,actor]);
    return { event:saved[0], created:true };
  });
}
async function assignLead(clientId, repId, actor, reason) {
  id(clientId); if (repId !== null) id(repId);
  if (typeof reason !== 'string' || !reason.trim() || reason.length>1000) fail(400, 'An assignment reason is required (up to 1000 characters).');
  return transaction(async conn => {
    const { rows } = await conn.query('select id, owner_rep_id from clients where id=$1 for update', [clientId]);
    const client = rows[0]; if (!client) fail(404, 'Lead not found.');
    if (repId) {
      const { rows: reps } = await conn.query('select id from sales_reps where id=$1 and active=true for share', [repId]);
      if (!reps.length) fail(400, 'Choose an active sales rep.');
    }
    if (client.owner_rep_id === repId) return client;
    if (repId) {
      const { rows: conflicts } = await conn.query(`select a.id from calendar_events a
        join calendar_events b on b.status='scheduled' and a.starts_at<b.ends_at and a.ends_at>b.starts_at
        join clients c on c.id=b.client_id
        where a.client_id=$1 and a.status='scheduled' and a.ends_at>now()
        and c.owner_rep_id=$2 and b.client_id<>$1 limit 1`, [clientId,repId]);
      if (conflicts.length) fail(409, 'The new rep has a conflicting appointment. Reschedule before assigning.');
    }
    const { rows: saved } = await conn.query(`update clients set owner_rep_id=$2,
      sales_stage=case when $2::uuid is not null then coalesce(sales_stage,'qualification') else sales_stage end,
      assigned_at=now(), assigned_by=$3, updated_at=now() where id=$1 returning id,owner_rep_id,assigned_at,assigned_by,sales_stage`, [clientId,repId,actor]);
    await conn.query(`insert into lead_assignment_history (client_id,from_rep_id,to_rep_id,assigned_by,reason)
      values ($1,$2,$3,$4,$5)`, [clientId,client.owner_rep_id,repId,actor,reason.trim()]);
    return saved[0];
  });
}
const JOIN = `select e.*, c.name as lead_name, c.company, c.source as lead_source,
  c.owner_rep_id, r.name as rep_name from calendar_events e join clients c on c.id=e.client_id
  left join sales_reps r on r.id=c.owner_rep_id`;
async function listEvents(query, repId) {
  const from=instant(query.from), to=instant(query.to);
  if (Date.parse(to)<=Date.parse(from) || Date.parse(to)-Date.parse(from)>93*86400000) fail(400, 'Choose a calendar range of up to 93 days.');
  const params=[from,to]; let where='where e.ends_at>$1 and e.starts_at<$2';
  if (repId) {params.push(id(repId)); where+=' and c.owner_rep_id=$3';}
  else if (query.rep_id==='unassigned') where+=' and c.owner_rep_id is null';
  else if (query.rep_id) {params.push(id(query.rep_id)); where+=' and c.owner_rep_id=$3';}
  if (query.channel) {
    if (!['manual', ...AGENT_CHANNELS].includes(query.channel)) fail(400,'Choose a valid channel.');
    params.push(query.channel); where+=` and e.channel=$${params.length}`;
  }
  return (await db.query(`${JOIN} ${where} order by e.starts_at,e.id`,params)).rows;
}
function ics(events) {
  const escape=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const date=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VantriqAI//CRM Calendar//EN'];
  for(const e of events) lines.push('BEGIN:VEVENT',`UID:${e.id}@crm.vantriqai.com`,`DTSTAMP:${date(e.updated_at)}`,
    `DTSTART:${date(e.starts_at)}`,`DTEND:${date(e.ends_at)}`,`SUMMARY:${escape(e.title)}`,
    `DESCRIPTION:${escape([e.lead_name,e.company,e.rep_name,e.notes].filter(Boolean).join(' — '))}`,
    `LOCATION:${escape(e.location)}`,`STATUS:${e.status==='cancelled'?'CANCELLED':'CONFIRMED'}`,'END:VEVENT');
  lines.push('END:VCALENDAR');
  // Fold UTF-8 lines without splitting a multibyte character (RFC 5545).
  return lines.map(line=>{let out='',part='';for(const ch of line){if(Buffer.byteLength(part+ch)>74){out+=part+'\r\n';part=' ';}part+=ch;}return out+part;}).join('\r\n')+'\r\n';
}
module.exports={id,instant,eventInput,fail,transaction,conflict,createEvent,assignLead,listEvents,ics};
