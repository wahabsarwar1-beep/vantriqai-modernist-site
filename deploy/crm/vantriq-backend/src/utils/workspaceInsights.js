const db = require('../db');
const { fail, id } = require('./calendar');

// Fixed SQL scopes. A portal caller supplies its authenticated client object;
// only the staff route can select a platform view or a customer identifier.
const ownLeads = `select c.id,case c.stage when 'lead' then 'new' when 'active' then 'won' when 'churned' then 'lost' else c.stage end as status,
  coalesce(nullif(lower(trim(c.source)),''),'manual') as source,c.created_at,null::timestamptz as next_action_at
  from clients c where not c.is_internal and $1::uuid is null
  union all select l.id,l.status,coalesce(nullif(lower(trim(l.source)),''),'manual'),l.created_at,l.next_action_at
  from portal_leads l join clients t on t.id=l.client_id where t.is_internal and l.crm_client_id is null`;
const customerLeads = `select l.id,l.status,coalesce(nullif(lower(trim(l.source)),''),'manual') as source,l.created_at,l.next_action_at
  from portal_leads l join clients t on t.id=l.client_id
  where not t.is_internal and l.crm_client_id is null and ($1::uuid is null or l.client_id=$1)`;

async function workspaceInsights({ client = null, scope = 'sales', clientId = null, days = '30', now = new Date() } = {}) {
  days=String(days);
  if(!['7','30','90'].includes(days)) fail(400,'Choose 7, 30 or 90 days.');
  if(client){ scope=client.is_internal?'sales':'customers'; clientId=client.is_internal?null:client.id; }
  if(!['sales','customers'].includes(scope)) fail(400,'Choose a valid workspace scope.');
  if(clientId) { id(clientId); if(scope!=='customers') fail(400,'Choose customer workspaces to filter a business.'); }
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end=new Date(Date.parse(today+'T00:00:00+05:00')+86400000);
  const start=new Date(+end-Number(days)*86400000);
  const leads=scope==='sales'?ownLeads:customerLeads;
  const eventScope=scope==='sales'?`(e.portal_lead_id is null or t.is_internal)`:
    `e.portal_lead_id is not null and not t.is_internal and ($1::uuid is null or l.client_id=$1)`;
  const {rows}=await db.query(`with scoped_leads as (${leads}),
    cohort as (select * from scoped_leads where created_at >= $2 and created_at < $3),
    scoped_events as (select e.* from calendar_events e left join portal_leads l on l.id=e.portal_lead_id
      left join clients t on t.id=l.client_id where ${eventScope} and e.starts_at >= $2 and e.starts_at < $3)
    select jsonb_build_object(
      'summary',(select jsonb_build_object('leads',count(*),'won',count(*) filter(where status='won'),
        'lost',count(*) filter(where status='lost'),'engaged',count(*) filter(where status in ('contacted','qualified','proposal','negotiation','won')),
        'proposed',count(*) filter(where status in ('proposal','negotiation','won'))) from cohort),
      'pipeline',(select jsonb_build_object('open',count(*),'due',count(*) filter(where next_action_at<$4),
        'age_0_7',count(*) filter(where created_at>=$4::timestamptz-interval '8 days'),
        'age_8_30',count(*) filter(where created_at<$4::timestamptz-interval '8 days' and created_at>=$4::timestamptz-interval '31 days'),
        'age_31_60',count(*) filter(where created_at<$4::timestamptz-interval '31 days' and created_at>=$4::timestamptz-interval '61 days'),
        'age_61_plus',count(*) filter(where created_at<$4::timestamptz-interval '61 days')) from scoped_leads where status not in ('won','lost')),
      'sources',coalesce((select jsonb_agg(s) from (select source,count(*)::int as leads,count(*) filter(where status='won')::int as won
        from cohort group by source order by count(*) desc,source) s),'[]'::jsonb),
      'stages',coalesce((select jsonb_agg(s) from (select status,count(*)::int as count from cohort group by status) s),'[]'::jsonb),
      'appointments',(select jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),
        'cancelled',count(*) filter(where status='cancelled'),'no_show',count(*) filter(where status='no_show'),
        'ended',count(*) filter(where ends_at<$4 and status<>'cancelled'),
        'completed_ended',count(*) filter(where ends_at<$4 and status='completed'),
        'overdue',count(*) filter(where ends_at<$4 and status in ('scheduled','confirmed'))) from scoped_events),
      'trend',coalesce((select jsonb_agg(s) from (select (starts_at at time zone 'Asia/Karachi')::date as day,
        count(*)::int as total,count(*) filter(where status='completed')::int as completed,
        count(*) filter(where status='cancelled')::int as cancelled,count(*) filter(where status='no_show')::int as no_show
        from scoped_events group by 1 order by 1) s),'[]'::jsonb)
    ) as result`,[clientId,start.toISOString(),end.toISOString(),now.toISOString()]);
  const data=rows[0].result;
  const startDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
  const step=days==='7'?1:7,trend=[];
  for(let i=0;i<Number(days);i+=step){const day=new Date(Date.parse(startDay+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);trend.push({day,total:0,completed:0,cancelled:0,no_show:0});}
  for(const row of data.trend){const index=Math.floor((Date.parse(row.day)-Date.parse(startDay))/86400000/step);if(trend[index])for(const k of ['total','completed','cancelled','no_show'])trend[index][k]+=row[k];}
  data.trend=trend;
  data.summary.won_share=data.summary.leads?Math.round(1000*data.summary.won/data.summary.leads)/10:null;
  data.appointments.completion_rate=data.appointments.ended?Math.round(1000*data.appointments.completed_ended/data.appointments.ended)/10:null;
  return { ...data,scope,days:Number(days),period:{from:startDay,to:today,timezone:'Asia/Karachi',trend_grain:step===1?'day':'week'},generated_at:now.toISOString() };
}
module.exports={workspaceInsights};
