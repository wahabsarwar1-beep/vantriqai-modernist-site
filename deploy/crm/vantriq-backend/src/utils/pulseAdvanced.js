const db = require('../db');
const INTENTS = ['pricing','purchase','support','booking','complaint','other'];
const STATUS = ['success','failure'];
const BOOLS = ['qualified_lead','meeting_booked','deal_won','confirmed_resolution'];
const NUMBERS = ['first_response_ms','cost_pkr','attributed_revenue_pkr','staff_minutes_saved'];
function validatePulse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data must be an object');
  const out = {};
  for (const key of Object.keys(data)) {
    if (BOOLS.includes(key)) { if (typeof data[key] !== 'boolean') throw new Error(key+' must be boolean'); }
    else if (NUMBERS.includes(key)) { if (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key]<0 || data[key]>1e12) throw new Error(key+' must be a non-negative finite number (maximum 1e12)'); }
    else if (key==='intent') { if (!INTENTS.includes(data[key])) throw new Error('Invalid intent'); }
    else if (key==='status') { if (!STATUS.includes(data[key])) throw new Error('Invalid status'); }
    else if (key==='handoff_reason') { if (typeof data[key]!=='string' || !data[key].trim() || data[key].length>80) throw new Error('handoff_reason must be 1–80 characters'); }
    else throw new Error('Unsupported Pulse field: '+key);
    out[key]=key==='handoff_reason'?data[key].trim():data[key];
  }
  if(!Object.keys(out).length) throw new Error('At least one Pulse measurement is required');
  return out;
}
const round=x=>Math.round(x*10)/10;
function percentile(values,p) { if(!values.length)return null; const a=values.slice().sort((x,y)=>x-y),i=(a.length-1)*p;return round(a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1)); }
function buildPulseAdvanced(sessions,events,{sampled=false}={}) {
  const key=x=>JSON.stringify([x.client_id,x.session_id]);
  const groups=new Map(sessions.map(s=>[key(s),{...s,events:[]}])) , seen=new Set();
  let unlinked=0;const statuses={success:0,failure:0},money={cost:0,revenue:0,saved:0,cost_events:0,revenue_events:0,saved_events:0};
  for(const event of events.slice().sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at))) {
    const id=JSON.stringify([event.client_id,event.event_id]);if(seen.has(id))continue;seen.add(id);
    let data;try{data=validatePulse(event.data);}catch{continue;}
    if(data.status)statuses[data.status]++;
    for(const [field,total,counter] of [['cost_pkr','cost','cost_events'],['attributed_revenue_pkr','revenue','revenue_events'],['staff_minutes_saved','saved','saved_events']]) if(data[field]!=null){money[total]+=data[field];money[counter]++;}
    const group=groups.get(key(event));if(group)group.events.push(data);else unlinked++;
  }
  const agents=new Map(),channels=new Map(),intents=new Map(),reasons=new Map(),speeds=[];
  let qualified=0,meetings=0,won=0,tracked=0,measured=0,slow=0;
  for(const group of groups.values()) {
    const agentKey=JSON.stringify([group.client_id,group.agent_id]);
    if(!agents.has(agentKey))agents.set(agentKey,{name:group.agent_name||'Main agent',company:group.company,conversations:0,reported_handoffs:0,handoffs:0,resolution_reported:0,resolved:0,qualified:0,qualification_reported:0,meetings:0,won:0,speeds:[],tracked:0});
    const a=agents.get(agentKey);a.conversations++;
    if(group.handoff_reported){a.reported_handoffs++;if(group.handoff)a.handoffs++;}
    const channel=group.channel||'Unknown';if(!channels.has(channel))channels.set(channel,{name:channel,conversations:0,tracked:0,qualified:0,meetings:0,won:0});
    const ch=channels.get(channel);ch.conversations++;
    if(group.events.length){tracked++;a.tracked++;ch.tracked++;}
    const has=field=>group.events.some(e=>e[field]===true);
    if(group.events.some(e=>typeof e.qualified_lead==='boolean'))a.qualification_reported++;
    for(const [field,target] of [['qualified_lead','qualified'],['meeting_booked','meetings'],['deal_won','won']]) if(has(field)){a[target]++;ch[target]++;}
    qualified+=has('qualified_lead')?1:0;meetings+=has('meeting_booked')?1:0;won+=has('deal_won')?1:0;
    if(group.events.some(e=>typeof e.confirmed_resolution==='boolean'))a.resolution_reported++;
    if(has('confirmed_resolution'))a.resolved++;
    const first=group.events.find(e=>e.first_response_ms!=null);if(first){speeds.push(first.first_response_ms/1000);a.speeds.push(first.first_response_ms/1000);measured++;if(first.first_response_ms>60000)slow++;}
    for(const intent of new Set(group.events.map(e=>e.intent).filter(Boolean)))intents.set(intent,(intents.get(intent)||0)+1);
    for(const reason of new Set(group.events.map(e=>e.handoff_reason).filter(Boolean))) if(group.handoff===true) reasons.set(reason,(reasons.get(reason)||0)+1);
  }
  return {sampled,conversations:groups.size,tracked,unlinked_events:unlinked,
    outcomes:{qualified,meetings,won,channels:[...channels.values()]},
    response:{measured,median_seconds:percentile(speeds,.5),p95_seconds:percentile(speeds,.95),over_60_seconds:slow,unmeasured:groups.size-measured},
    agents:[...agents.values()].map(({speeds,...a})=>({...a,median_seconds:percentile(speeds,.5),qualification_pct:a.qualification_reported?round(a.qualified/a.qualification_reported*100):null,handoff_pct:a.reported_handoffs?round(a.handoffs/a.reported_handoffs*100):null,resolution_pct:a.resolution_reported?round(a.resolved/a.resolution_reported*100):null})).sort((a,b)=>b.conversations-a.conversations),
    intents:[...intents].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
    handoff_reasons:[...reasons].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
    health:{...statuses,events:statuses.success+statuses.failure},
    value:{...money,cost:round(money.cost),revenue:round(money.revenue),saved:round(money.saved)} };
}
async function pulseAdvanced(clientId,b) {
  const [sessions,events]=await Promise.all([
    db.query(`with sessions as (select u.client_id,u.session_id,min(u.occurred_at) started,
      (array_agg(u.agent_id order by u.occurred_at) filter(where u.agent_id is not null))[1] agent_id,
      mode() within group(order by u.channel) channel,bool_or(u.handoff) handoff,count(u.handoff)>0 handoff_reported
      from usage_events u where ($1::uuid is null or u.client_id=$1) and u.occurred_at<=now()
      group by u.client_id,u.session_id having min(u.occurred_at)>=$2)
      select s.*,a.name agent_name,c.company from sessions s left join client_agents a on a.id=s.agent_id
      join clients c on c.id=s.client_id order by s.started desc limit 50001`,[clientId,b.cur_start]),
    db.query(`select client_id,session_id,event_id,occurred_at,data from pulse_events
      where ($1::uuid is null or client_id=$1) and occurred_at>=$2 and occurred_at<=now()
      order by occurred_at desc limit 100001`,[clientId,b.cur_start])
  ]);
  const result=buildPulseAdvanced(sessions.rows.slice(0,50000),events.rows.slice(0,100000),{sampled:sessions.rows.length>50000||events.rows.length>100000});
  if(clientId){delete result.health;delete result.value;}
  return result;
}
module.exports={validatePulse,buildPulseAdvanced,pulseAdvanced};
