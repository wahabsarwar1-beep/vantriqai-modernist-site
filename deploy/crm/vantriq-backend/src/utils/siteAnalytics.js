const db = require('../db');
const { isIP } = require('node:net');
const geoip = require('geoip-lite2');
const EVENTS = ['page_view','chat_open','whatsapp_click','brief_sent'];
const SECTIONS = ['home','products','pricing','industries','contact','how-it-works','resources','privacy','cookies','other'];
const emptyCounts = () => Object.fromEntries(EVENTS.map(e=>[e,0]));
const RANGES = { today: [1,'Today'], '7d': [7,'Last 7 days'], '30d': [30,'Last 30 days'], '90d': [90,'Last 90 days'], '180d': [180,'Last 180 days'] };
function validateSiteEvent(b) {
  if(!b || Array.isArray(b) || !EVENTS.includes(b.event) || !SECTIONS.includes(b.section) || !['pk','global'].includes(b.region) || Object.keys(b).some(k=>!['event','section','region','client_ip'].includes(k)) || (b.client_ip !== undefined && (typeof b.client_ip !== 'string' || !isIP(b.client_ip)))) throw new Error('Invalid aggregate website event');
  return {event:b.event,section:b.section,region:b.region,...(b.client_ip ? {client_ip:b.client_ip}: {})};
}
function locationOf(ip) {
  if (!ip || !isIP(ip)) return {country:'',subdivision:'',city:''};
  // IPv4-mapped IPv6 is common behind reverse proxies.
  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  // The bundled database resolves locally: there is no per-visitor API request.
  const geo = geoip.lookup(address);
  const country = /^[A-Z]{2}$/.test(geo?.country || '') ? geo.country : '';
  const text = (s,max) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max) : '';
  return {country,subdivision:country ? text(geo?.region,16) : '',city:country ? text(geo?.city,120) : ''};
}
async function recordSiteEvent(body) {
  const b=validateSiteEvent(body),loc=locationOf(b.client_ip);
  // One SQL statement makes the two counters atomic. IP is not a SQL parameter.
  await db.query(`with activity as (
    insert into website_activity(day,region,section,event,total) values((now() at time zone 'Asia/Karachi')::date,$1,$2,$3,1)
    on conflict(day,region,section,event) do update set total=website_activity.total+1 returning day
  ) insert into website_location_activity(day,region,section,event,country,subdivision,city,total)
    select day,$1,$2,$3,$4,$5,$6,1 from activity
    on conflict(day,region,section,event,country,subdivision,city) do update set total=website_location_activity.total+1`,[b.region,b.section,b.event,loc.country,loc.subdivision,loc.city]);
  await purgeSiteAnalytics();
}
async function purgeSiteAnalytics() {
  await db.query(`with old_locations as (delete from website_location_activity where day < (now() at time zone 'Asia/Karachi')::date-179)
    delete from website_activity where day < (now() at time zone 'Asia/Karachi')::date-179`);
}
async function siteAnalytics(start) {
  await purgeSiteAnalytics();
  const {rows}=await db.query(`select day::text,region,section,event,total::int from website_activity where day>=($1::timestamptz at time zone 'Asia/Karachi')::date and day<=(now() at time zone 'Asia/Karachi')::date order by day,region,section,event`,[start]);
  const {rows:geoRows}=await db.query(`select country,subdivision,city,event,sum(total)::int total from website_location_activity
    where day>=($1::timestamptz at time zone 'Asia/Karachi')::date and day<=(now() at time zone 'Asia/Karachi')::date group by country,subdivision,city,event`,[start]);
  const totals=emptyCounts(),sections={},regions={},days={};
  for(const row of rows){ totals[row.event]+=row.total; (sections[row.section] ||= emptyCounts())[row.event]+=row.total;
    (regions[row.region] ||= emptyCounts())[row.event]+=row.total; (days[row.day] ||= emptyCounts())[row.event]+=row.total; }
  const locations=new Map(),locatedTotals=emptyCounts();
  for(const row of geoRows){const key=JSON.stringify([row.country,row.subdivision,row.city]);
    if(!locations.has(key))locations.set(key,{country:row.country,subdivision:row.subdivision,city:row.city,...emptyCounts()});
    locations.get(key)[row.event]+=row.total;locatedTotals[row.event]+=row.total;
  }
  // Existing totals predate location collection. Show them as unknown; never
  // retroactively infer locations from the Pakistan/Global site version.
  const old=emptyCounts();for(const e of EVENTS)old[e]=Math.max(0,totals[e]-locatedTotals[e]);
  if(EVENTS.some(e=>old[e])){
    const key=JSON.stringify(['','','']);if(!locations.has(key))locations.set(key,{country:'',subdivision:'',city:'',...emptyCounts()});
    for(const e of EVENTS)locations.get(key)[e]+=old[e];
  }
  const list=[...locations.values()].sort((a,b)=>b.page_view-a.page_view||a.country.localeCompare(b.country)||a.city.localeCompare(b.city));
  const countries=new Map();for(const row of list){if(!countries.has(row.country))countries.set(row.country,{country:row.country,...emptyCounts()});for(const e of EVENTS)countries.get(row.country)[e]+=row[e];}
  return {totals,sections,regions,days,locations:list,countries:[...countries.values()].sort((a,b)=>b.page_view-a.page_view),retention_days:180};
}
async function websiteAnalytics({range='30d'}={}) {
  if(!RANGES[range])range='30d';
  const {rows}=await db.query(`select (((now() at time zone 'Asia/Karachi')::date-$1::int)::timestamp at time zone 'Asia/Karachi') start`,[RANGES[range][0]-1]);
  return {range,time_zone:'Asia/Karachi',generated_at:new Date().toISOString(),period:{current_label:RANGES[range][1],current_start:rows[0].start},website:await siteAnalytics(rows[0].start)};
}
module.exports={validateSiteEvent,recordSiteEvent,siteAnalytics,purgeSiteAnalytics,locationOf,websiteAnalytics};
