/* CRM calendar: Pakistan time is explicit for viewing and booking. */
window.VQCAL=(()=>{
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let generation=0;
  let month=today().slice(0,7),rep='',channel='',mode='month',events=[],error='',loaded='',loading=false,history=[];
  const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
  const clock=d=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'}).format(new Date(d));
  const local=d=>day(d)+'T'+clock(d);
  function range(){const [y,m]=month.split('-').map(Number);return {from:month+'-01T00:00:00+05:00',to:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)+'T00:00:00+05:00'};}
  const key=()=>generation+'|'+month+'|'+rep+'|'+channel;
  function query(){const q=new URLSearchParams(range());if(rep)q.set('rep_id',rep);if(channel)q.set('channel',channel);return q.toString();}
  async function load(){if(loading)return;loading=true;const k=key();try{const data=await API.get('/api/calendar?'+query());if(k===key()){events=data;error='';loaded=k;}}catch(e){if(k===key()){error=e.message;loaded=k;}}finally{loading=false;if(currentView==='calendar')render();}}
  function filter(field,value){if(field==='month'){if(!/^\d{4}-\d{2}$/.test(value))return;month=value;}if(field==='rep')rep=value;if(field==='channel')channel=value;if(field==='mode')mode=value;render();}
  function move(delta){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);render();}
  function owner(c){return c.ownerRepId ? repNameOf(c)||'Assigned rep' : 'Unassigned';}
  function badge(c){return `<div class="co calendar-owner">${esc(owner(c))}${c.assignedAt?' · '+esc(day(c.assignedAt)):''}</div>`;}
  function renderCalendar(){
    if(loaded!==key()) {load();return '<div class="card" style="padding:24px;">Loading calendar…</div>';}
    const controls=`<div class="card calendar-toolbar">
      <button class="btn btn-ghost" onclick="VQCAL.move(-1)" aria-label="Previous month">←</button>
      <div class="field calendar-filter"><label for="calendar_month">Month</label><input id="calendar_month" type="month" aria-label="Calendar month" value="${month}" onchange="VQCAL.filter('month',this.value)"></div>
      <button class="btn btn-ghost" onclick="VQCAL.move(1)" aria-label="Next month">→</button>
      ${isAdmin()?`<div class="field calendar-filter"><label for="calendar_rep">Sales rep</label><select id="calendar_rep" aria-label="Filter by sales rep" onchange="VQCAL.filter('rep',this.value)"><option value="">All reps</option><option value="unassigned" ${rep==='unassigned'?'selected':''}>Unassigned</option>${state.reps.map(r=>`<option value="${r.id}" ${rep===r.id?'selected':''}>${esc(r.name)}${r.active?'':' (inactive)'}</option>`).join('')}</select></div>`:''}
      <div class="field calendar-filter"><label for="calendar_channel">Channel</label><select id="calendar_channel" aria-label="Filter by channel" onchange="VQCAL.filter('channel',this.value)">${[['','All channels'],['manual','Manual'],['website','Website agent'],['whatsapp','WhatsApp agent']].map(([v,t])=>`<option value="${v}" ${channel===v?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field calendar-filter"><label for="calendar_mode">View</label><select id="calendar_mode" aria-label="Calendar view" onchange="VQCAL.filter('mode',this.value)"><option value="month" ${mode==='month'?'selected':''}>Month</option><option value="agenda" ${mode==='agenda'?'selected':''}>Agenda</option></select></div>
      <button class="btn btn-ghost" onclick="VQCAL.refresh()">Refresh</button>
      <button class="btn btn-ghost" onclick="VQCAL.exportCalendar()">Export calendar (.ics)</button>
      <span class="footnote calendar-timezone">All times: Pakistan (UTC+05:00)</span></div>`;
    if(error)return controls+`<div class="card" role="alert" style="padding:24px;">${esc(error)}</div>`;
    const scheduled=events.filter(e=>e.status==='scheduled');
    const counts=`<div class="grid kpi-row calendar-summary">${[['Scheduled',scheduled.length],['Unassigned',scheduled.filter(e=>!e.owner_rep_id).length],['Past due',scheduled.filter(e=>Date.parse(e.ends_at)<Date.now()).length]].map(([label,value])=>`<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`).join('')}</div>`;
    if(mode==='agenda')return controls+counts+`<div class="table-wrap"><table><thead><tr><th>Time (PKT)</th><th>Appointment</th><th>Lead</th><th>Assigned to</th><th>Channel</th><th>Status</th></tr></thead><tbody>${events.map(e=>`<tr class="row-click" onclick="VQCAL.openEvent('${e.id}')"><td>${day(e.starts_at)}<br>${clock(e.starts_at)}–${clock(e.ends_at)}</td><td>${esc(e.title)}<br>${esc(e.kind.replace('_',' '))}</td><td>${esc(e.lead_name)}<br>${esc(e.company)}</td><td>${esc(e.rep_name||'Unassigned')}</td><td>${esc(e.channel)}</td><td>${esc(e.status.replace('_',' '))}</td></tr>`).join('')||'<tr><td colspan="6">No appointments this month.</td></tr>'}</tbody></table></div>`;
    const [y,m]=month.split('-').map(Number),offset=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate();
    let cells=Array(offset).fill('<div class="calendar-day calendar-empty"></div>');
    for(let n=1;n<=days;n++){const date=month+'-'+String(n).padStart(2,'0');cells.push(`<div class="calendar-day ${date===today()?'calendar-today':''}"><button class="calendar-date" aria-label="New appointment ${date}" onclick="VQCAL.openEvent(null,null,'${date}')">${n}</button>${events.filter(e=>day(e.starts_at)<=date&&day(new Date(Date.parse(e.ends_at)-1))>=date).map(e=>`<button class="calendar-booking ${e.status==='cancelled'?'calendar-cancelled':''}" onclick="VQCAL.openEvent('${e.id}')"><strong>${clock(e.starts_at)} ${esc(e.title)}</strong><br>${esc(e.lead_name)}<br>${esc(e.rep_name||'Unassigned')} · ${esc(e.channel)}<br>${esc(e.status.replace('_',' '))}</button>`).join('')}</div>`);}
    return controls+counts+`<div class="calendar-scroll"><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="calendar-weekday">${d}</div>`).join('')}${cells.join('')}</div></div>`;
  }
  function refresh(){loaded='';render();}
  function openEvent(eventId,clientId,date){openPanel=null;openModal={type:'calendar',id:eventId,clientId,date};render();}
  function eventModal(){
    const e=openModal.id?events.find(e=>e.id===openModal.id):null;
    const selected=e?e.client_id:openModal.clientId;
    return `<div class="modal"><div class="modal-head"><h3>${e?'Edit appointment':'New appointment'}</h3><button class="close-x" onclick="closeModal()">${iconX(18)}</button></div><div class="modal-body">
      <p class="footnote">Times are Pakistan time (UTC+05:00). The lead's sales rep owns the appointment.</p>
      <div class="field"><label for="ce_lead">Lead</label><select id="ce_lead" ${e?'disabled':''} onchange="VQCAL.updateOwner(this.value)"><option value="">Choose a lead</option>${state.clients.map(c=>`<option value="${c.id}" ${selected===c.id?'selected':''}>${esc(c.name)} · ${esc(c.company)}</option>`).join('')}</select></div>
      <div id="ce_owner" class="calendar-assignment-summary">Assigned to: ${esc(owner(state.clients.find(c=>c.id===selected)||{}))}</div>
      <div class="field"><label for="ce_title">Title</label><input id="ce_title" maxlength="200" value="${esc(e?e.title:'')}" placeholder="Discovery call, demo or follow-up"></div>
      <div class="field-row"><div class="field"><label for="ce_start">Start (PKT)</label><input id="ce_start" type="datetime-local" value="${e?local(e.starts_at):(openModal.date||today())+'T10:00'}"></div><div class="field"><label for="ce_end">End (PKT)</label><input id="ce_end" type="datetime-local" value="${e?local(e.ends_at):(openModal.date||today())+'T10:30'}"></div></div>
      <div class="field-row"><div class="field"><label for="ce_kind">Type</label><select id="ce_kind">${['meeting','demo','call','follow_up'].map(k=>`<option value="${k}" ${e&&e.kind===k?'selected':''}>${k.replace('_',' ')}</option>`).join('')}</select></div><div class="field"><label for="ce_status">Status</label><select id="ce_status">${['scheduled','completed','cancelled','no_show'].map(k=>`<option value="${k}" ${e&&e.status===k?'selected':''}>${k.replace('_',' ')}</option>`).join('')}</select></div></div>
      <div class="field"><label for="ce_location">Location or meeting link</label><input id="ce_location" maxlength="500" value="${esc(e?e.location:'')}"></div>
      <div class="field"><label for="ce_notes">Notes</label><textarea id="ce_notes" maxlength="4000">${esc(e?e.notes:'')}</textarea></div>
      ${e?`<p class="footnote">Source: ${esc(e.channel)} · Created by ${esc(e.created_by)}</p>`:''}
      <p id="ce_error" role="alert" style="color:var(--red);"></p></div><div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button id="ce_save" class="btn btn-primary" onclick="VQCAL.saveEvent()">Save appointment</button></div></div>`;
  }
  function updateOwner(id){document.getElementById('ce_owner').textContent='Assigned to: '+owner(state.clients.find(c=>c.id===id)||{});}
  async function saveEvent(){const get=id=>document.getElementById(id).value;const b={title:get('ce_title'),starts_at:get('ce_start')+'+05:00',ends_at:get('ce_end')+'+05:00',kind:get('ce_kind'),status:get('ce_status'),location:get('ce_location'),notes:get('ce_notes')};const button=document.getElementById('ce_save');button.disabled=true;try{if(openModal.id)await API.patch('/api/calendar/'+openModal.id,b);else await API.post('/api/calendar',{...b,client_id:get('ce_lead'),channel:'manual'});closeModal();loaded='';showToast('Appointment saved');render();}catch(e){document.getElementById('ce_error').textContent=e.message;button.disabled=false;}}
  async function assign(id){try{history=await API.get('/api/clients/'+id+'/assignment-history');openPanel=null;openModal={type:'assignment',id};render();}catch(e){showToast(e.message,'warn');}}
  function assignmentModal(){const c=state.clients.find(c=>c.id===openModal.id);return `<div class="modal"><div class="modal-head"><h3>Assign lead: ${esc(c.name)}</h3><button class="close-x" onclick="closeModal()">${iconX(18)}</button></div><div class="modal-body">
    <p class="calendar-assignment-summary">Current owner: <strong>${esc(owner(c))}</strong></p>
    <div class="field"><label for="la_rep">Sales rep</label><select id="la_rep"><option value="">Unassigned</option>${state.reps.filter(r=>r.active||r.id===c.ownerRepId).map(r=>`<option value="${r.id}" ${c.ownerRepId===r.id?'selected':''} ${r.active?'':'disabled'}>${esc(r.name)}${r.active?'':' (inactive)'}</option>`).join('')}</select></div>
    <div class="field"><label for="la_reason">Reason for assignment or reassignment</label><textarea id="la_reason" maxlength="1000" placeholder="e.g. Website enquiry — follow up tomorrow"></textarea></div>
    <p class="footnote">The selected rep sees this lead and its appointments in their own portal. Reassignment removes the previous rep's access.</p>
    <p id="la_error" role="alert" style="color:var(--red);"></p><h4>Assignment history</h4>
    ${history.map(h=>`<div class="calendar-history-entry"><strong>${esc(h.from_rep_name||'Unassigned')} → ${esc(h.to_rep_name||'Unassigned')}</strong><br>${esc(day(h.created_at))} ${clock(h.created_at)} PKT · ${esc(h.assigned_by)}<br>${esc(h.reason)}</div>`).join('')||'<p class="footnote">No recorded assignments yet. Existing rep-created leads retain their original owner.</p>'}
    </div><div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button id="la_save" class="btn btn-primary" onclick="VQCAL.saveAssignment()">Save assignment</button></div></div>`;}
  async function saveAssignment(){const button=document.getElementById('la_save');button.disabled=true;try{await API.patch('/api/clients/'+openModal.id+'/assignment',{rep_id:document.getElementById('la_rep').value||null,reason:document.getElementById('la_reason').value});await loadState();loaded='';closeModal();showToast('Assignment saved');render();}catch(e){document.getElementById('la_error').textContent=e.message;button.disabled=false;}}
  async function exportCalendar(){try{const rows=await API.get('/api/calendar?'+query()); // Fetch through the authenticated JSON client; build a simple standards-compliant export locally.
    const escICS=v=>String(v||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const dt=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VantriqAI//CRM//EN'];rows.forEach(e=>lines.push('BEGIN:VEVENT','UID:'+e.id+'@crm.vantriqai.com','DTSTAMP:'+dt(e.updated_at),'DTSTART:'+dt(e.starts_at),'DTEND:'+dt(e.ends_at),'SUMMARY:'+escICS(e.title),'DESCRIPTION:'+escICS([e.lead_name,e.rep_name,e.notes].filter(Boolean).join(' — ')),'LOCATION:'+escICS(e.location),'STATUS:'+(e.status==='cancelled'?'CANCELLED':'CONFIRMED'),'END:VEVENT'));lines.push('END:VCALENDAR');
    const folded=lines.map(line=>{let out='',part='';for(const ch of line){if(new TextEncoder().encode(part+ch).length>74){out+=part+'\r\n';part=' ';}part+=ch;}return out+part;}).join('\r\n')+'\r\n';
    const url=URL.createObjectURL(new Blob([folded],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='vantriq-calendar-'+month+'.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){showToast(e.message,'warn');}}
  function reset(){generation++;events=[];history=[];loaded='';error='';rep='';channel='';month=today().slice(0,7);}
  return {reset,renderCalendar,filter,move,refresh,openEvent,eventModal,updateOwner,saveEvent,assign,assignmentModal,saveAssignment,badge,exportCalendar};
})();
