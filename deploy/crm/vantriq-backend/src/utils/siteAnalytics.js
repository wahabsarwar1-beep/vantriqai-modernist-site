const db = require('../db');
const EVENTS = ['page_view','chat_open','whatsapp_click','brief_sent'];
const SECTIONS = ['home','products','pricing','industries','contact','how-it-works','resources','privacy','cookies','other'];
function validateSiteEvent(b) {
  if(!b || Array.isArray(b) || !EVENTS.includes(b.event) || !SECTIONS.includes(b.section) || !['pk','global'].includes(b.region) || Object.keys(b).some(k=>!['event','section','region'].includes(k))) throw new Error('Invalid aggregate website event');
  return {event:b.event,section:b.section,region:b.region};
}
async function recordSiteEvent(body) {
  const b=validateSiteEvent(body);
  await db.query(`insert into website_activity(day,region,section,event,total) values((now() at time zone 'Asia/Karachi')::date,$1,$2,$3,1)
    on conflict(day,region,section,event) do update set total=website_activity.total+1`,[b.region,b.section,b.event]);
  await purgeSiteAnalytics();
}
async function purgeSiteAnalytics() {
  await db.query(`delete from website_activity where day < (now() at time zone 'Asia/Karachi')::date-179`);
}
async function siteAnalytics(start) {
  await purgeSiteAnalytics();
  const {rows}=await db.query(`select day::text,region,section,event,total::int from website_activity where day>=($1::timestamptz at time zone 'Asia/Karachi')::date order by day,region,section,event`,[start]);
  const totals=Object.fromEntries(EVENTS.map(e=>[e,0]));
  const sections={},regions={},days={};
  for(const row of rows){ totals[row.event]+=row.total; const s=sections[row.section] ||= Object.fromEntries(EVENTS.map(e=>[e,0]));s[row.event]+=row.total;
    const r=regions[row.region] ||= Object.fromEntries(EVENTS.map(e=>[e,0]));r[row.event]+=row.total;
    const d=days[row.day] ||= Object.fromEntries(EVENTS.map(e=>[e,0]));d[row.event]+=row.total; }
  return {totals,sections,regions,days,retention_days:180};
}
module.exports={validateSiteEvent,recordSiteEvent,siteAnalytics,purgeSiteAnalytics};
