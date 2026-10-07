/* Each mount belongs to one signed-in customer. No account data is cached on disk. */
window.VQWORK=(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={month:'Month',agenda:'Agenda',new:'New',contacted:'Contacted',qualified:'Qualified',proposal:'Proposal sent',negotiation:'Negotiation',won:'Won',lost:'Lost',scheduled:'Scheduled',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',no_show:'No-show',follow_up:'Follow-up',manual:'Manual',website:'Website',whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Messenger'};
  const label=s=>labels[s]||s;
  const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
  const clock=d=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'}).format(new Date(d));
  const local=d=>d?day(d)+'T'+clock(d):'';
  const when=d=>d?day(d)+' · '+clock(d)+' PKT':'—';
  let root,host,view='leads',month=day(new Date()).slice(0,7),mode=window.matchMedia?.('(max-width:700px)').matches?'agenda':'month';
  let leads=[],summary={},total=0,offset=0,events=[],search='',stage='',channel='',status='',detail=null,error='',busy=false,timer,gen=0;
  const button=(action,text,id='',cls='btn btn-ghost')=>`<button type="button" class="${cls}" data-work="${action}"${id?` data-id="${esc(id)}"`:''}>${text}</button>`;
  const pill=s=>`<span class="pill ${['completed','won','confirmed'].includes(s)?'pill-paid':['cancelled','lost','no_show'].includes(s)?'work-pill-neutral':'pill-pending'}">${esc(label(s))}</span>`;
  const options=(values,selected,blank)=>`${blank!==undefined?`<option value="">${esc(blank)}</option>`:''}${values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(label(v))}</option>`).join('')}`;
  function range(){const [y,m]=month.split('-').map(Number);return {from:month+'-01T00:00:00+05:00',to:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)+'T00:00:00+05:00'};}
  function query(){const q=new URLSearchParams(range());if(channel)q.set('channel',channel);if(status)q.set('status',status);return q;}
  async function load(silent=false){
    if(busy)return;busy=true;const g=gen,h=host;error='';
    if(!silent&&root)root.innerHTML='<div class="card">Loading your '+view+'…</div>';
    try{
      const [list,appointments]=await Promise.all([h.api('/leads?'+new URLSearchParams({q:search,status:stage,offset:String(offset),limit:'50'})),h.api('/calendar?'+query())]);
      if(g!==gen)return;
      const freshDetail=detail?await h.api('/leads/'+detail.lead.id):null;
      if(g!==gen)return;leads=list.leads;summary=list.summary||{};total=list.total;events=appointments;detail=freshDetail;
    }catch(e){if(g!==gen)return;error=e.message;host.error?.(e);}
    finally{if(g===gen){busy=false;render();}}
  }
  function render(){
    if(!root)return;
    root.innerHTML=error?`<div class="card" role="alert">${esc(error)} ${button('refresh','Try again')}</div>`:detail?leadDetail():view==='calendar'?calendar():leadList();
    host.labelTables?.();
  }
  function leadList(){return `<div class="work-kpis work-lead-kpis">${[['Open pipeline',summary.open,'Active opportunities','pipeline'],['Follow-ups due',summary.due,'Ready for your attention','due'],['Unassigned',summary.unassigned,'Choose a follow-up owner','owner'],['Won',summary.won,'Converted opportunities','won']].map(([k,v,n,t])=>`<div class="card work-metric work-metric-${t}"><div class="work-metric-label">${k}</div><strong>${v??'—'}</strong><div class="work-muted">${n}</div></div>`).join('')}</div><div class="work-toolbar">${button('new-lead','New lead','','btn btn-primary')}${button('refresh','Refresh')}<form data-form="search" class="work-search"><input name="q" type="search" aria-label="Search leads" placeholder="Search name, company, phone or email" maxlength="200" value="${esc(search)}"><button class="btn btn-ghost">Search</button></form><select data-filter="stage" aria-label="Lead status">${options(['new','contacted','qualified','proposal','negotiation','won','lost'],stage,'All lead statuses')}</select></div>
      <p class="work-muted">${total} matching leads · Each lead belongs to your business. Meeting outcomes and sales stages are tracked separately.</p>
      <div class="card work-table"><table><thead><tr><th>Lead</th><th>Source</th><th>Owner</th><th>Status</th><th>Next action</th><th></th></tr></thead><tbody>${leads.map(l=>`<tr><td><div class="work-person"><span class="work-avatar" aria-hidden="true">${esc((l.name||'?').trim().slice(0,1).toUpperCase())}</span><div><strong>${esc(l.name||'Unnamed lead')}</strong><div class="work-muted">${esc(l.company)}</div><small>${esc(l.phone||l.email)}</small></div></div></td><td>${esc(label(l.source))}</td><td>${esc(l.assigned_to||'Unassigned')}</td><td>${pill(l.status)}</td><td>${esc(l.next_action||'—')}<br><small>${l.next_action_at?esc(when(l.next_action_at)):''}</small></td><td>${button('lead','Open',l.id)}</td></tr>`).join('')||'<tr><td colspan="6">No leads yet. Add a lead, save a customer as a lead, or connect your agent’s lead capture.</td></tr>'}</tbody></table></div>
      <div class="work-toolbar">${offset?button('previous-page','Previous'):''}<span class="work-muted">${total?offset+1:0}–${offset+leads.length} of ${total}</span>${offset+leads.length<total?button('next-page','Next'):''}</div>`;}
  function eventCard(e){return `<button type="button" class="work-event ${e.status==='cancelled'?'work-cancelled':''}" data-work="event" data-id="${e.id}"><strong>${esc(clock(e.starts_at))} ${esc(e.title)}</strong><span>${esc(e.lead_name||'Unnamed lead')}</span><span>${esc(e.rep_name||'Unassigned')} · ${esc(label(e.channel))}</span>${pill(e.status)}</button>`;}
  function calendar(){
    const active=events.filter(e=>['scheduled','confirmed'].includes(e.status));
    const controls=`<div class="work-toolbar">${button('new-event','New appointment','','btn btn-primary')}<button type="button" class="btn btn-ghost" data-work="previous-month" aria-label="Previous month">←</button><input type="month" data-filter="month" aria-label="Calendar month" value="${month}"><button type="button" class="btn btn-ghost" data-work="next-month" aria-label="Next month">→</button>${button('today','This month')}<select data-filter="channel" aria-label="Appointment channel">${options(['manual','website','whatsapp','instagram','facebook'],channel,'All channels')}</select><select data-filter="status" aria-label="Appointment status">${options(['scheduled','confirmed','completed','cancelled','no_show'],status,'All statuses')}</select><select data-filter="mode" aria-label="Calendar view">${options(['month','agenda'],mode)}</select>${button('refresh','Refresh')}${button('export','Export calendar')}</div><p class="work-muted">All times: Pakistan (UTC+05:00). Updates refresh every 30 seconds while this page is open.</p>`;
    const kpis=`<div class="work-kpis">${[['Upcoming',active.filter(e=>Date.parse(e.ends_at)>=Date.now()).length],['Past due',active.filter(e=>Date.parse(e.ends_at)<Date.now()).length],['Completed',events.filter(e=>e.status==='completed').length]].map(([k,v])=>`<div class="card work-metric"><div class="work-metric-label">${k}</div><strong>${v}</strong><div class="work-muted">In the selected month and filters</div></div>`).join('')}</div>`;
    let body;
    if(mode==='agenda')body=`<div class="work-agenda">${events.map(e=>`<div><div class="work-muted">${esc(day(e.starts_at))} · ${clock(e.starts_at)}–${clock(e.ends_at)} PKT</div>${eventCard(e)}</div>`).join('')||'<div class="card">No appointments this month. Book a meeting from a lead to get started.</div>'}</div>`;
    else{
      const [y,m]=month.split('-').map(Number),off=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate();let cells=Array(off).fill('<div class="work-day work-empty"></div>');
      for(let n=1;n<=days;n++){const d=month+'-'+String(n).padStart(2,'0');cells.push(`<div class="work-day ${d===day(new Date())?'work-today':''}"><span class="work-day-number">${n}</span>${events.filter(e=>day(e.starts_at)<=d&&day(new Date(Date.parse(e.ends_at)-1))>=d).map(eventCard).join('')}</div>`);}
      body=`<div class="work-calendar-scroll"><div class="work-calendar">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="work-weekday">${d}</div>`).join('')}${cells.join('')}</div></div>`;
    }
    return controls+kpis+body;
  }
  function leadDetail(){const {lead:l,appointments,history}=detail;return `<div class="work-toolbar">${button('back','← All leads')}${button('edit-lead','Edit lead',l.id)}${button('book','Book meeting',l.id,'btn btn-primary')}${button('conversation','View conversations',l.crm_client_id&&l.phone?(/^03\d{9}$/.test(l.phone.replace(/\D/g,''))?'92'+l.phone.replace(/\D/g,'').slice(1):l.phone.replace(/\D/g,'')):l.contact_key)}</div><div class="card"><h2>${esc(l.name||'Unnamed lead')}</h2><p>${esc(l.company)} · ${esc(l.phone)} · ${esc(l.email)}</p><div class="work-toolbar">${pill(l.status)}<span>Owner: ${esc(l.assigned_to||'Unassigned')}</span><span>Source: ${esc(label(l.source))}</span></div><p style="white-space:pre-wrap">${esc(l.notes)}</p><p><strong>Next action:</strong> ${esc(l.next_action||'Not set')} ${l.next_action_at?' · '+esc(when(l.next_action_at)):''}</p></div>
    <div class="work-detail-grid"><section class="card"><h3>Meetings & follow-ups</h3>${appointments.map(e=>`<p class="work-muted">${esc(when(e.starts_at))}</p>${eventCard(e)}`).join('')||'<p>No meetings booked yet.</p>'}</section><section class="card"><h3>Activity history</h3>${history.map(h=>`<div class="work-history"><strong>${esc(h.action.replaceAll('_',' '))}</strong><div class="work-muted">${esc(when(h.created_at))} · ${esc(h.actor)}</div>${Object.entries(h.details).map(([k,v])=>`<div>${esc(k.replaceAll('_',' '))}: ${esc(v&&typeof v==='object'?`${v.from??'—'} → ${v.to??'—'}`:v||'—')}</div>`).join('')}</div>`).join('')||'<p>No recorded changes yet.</p>'}</section></div>`;}
  function field(name,title,value='',type='text',max=200){return `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='text'||type==='email'?`maxlength="${max}"`:''}></label>`;}
  function modal(title,body,save){
    document.getElementById('work-dialog')?.remove();const d=document.createElement('dialog');d.id='work-dialog';d.className='work-dialog';
    d.innerHTML=`<form data-form="${save}"><div class="work-modal-head"><h2>${title}</h2><button type="button" data-work="close" class="btn btn-ghost" aria-label="Close dialog">×</button></div><div class="work-form">${body}</div><p role="alert" class="work-error"></p><div class="work-toolbar work-modal-foot"><button type="button" data-work="close" class="btn btn-ghost">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>`;
    document.body.appendChild(d);d.addEventListener('click',click);d.addEventListener('submit',submit);d.showModal();
  }
  function editLead(l={}){
    modal(l.id?'Edit lead':'New lead',`<input type="hidden" name="id" value="${esc(l.id)}">${field('name','Name',l.name,'text',160)}${field('company','Company',l.company)}${field('phone','Phone',l.phone,'text',40)}${field('email','Email',l.email,'email')}${l.id?`<label>Lead status<select name="status" aria-label="Status">${options(['new','contacted','qualified','proposal','negotiation','won','lost'],l.status)}</select></label>${field('assigned_to','Owner / salesperson',l.assigned_to)}<p class="work-muted work-full">Ownership identifies who follows up. Access remains limited to your business account.</p>${field('next_action','Next action',l.next_action)}${field('next_action_at','Follow-up time (PKT)',local(l.next_action_at),'datetime-local')}`:field('source','Source','manual')}<label class="work-full">Requirements & notes<textarea name="notes" maxlength="4000">${esc(l.notes)}</textarea></label>`,'lead');
  }
  async function editEvent(id,leadId){
    let e=id?(detail?.appointments||events).find(e=>e.id===id):null;
    let choices=leads;
    if(leadId&&!choices.some(l=>l.id===leadId)){const d=await host.api('/leads/'+leadId);choices=[d.lead,...choices];}
    const picked=e?.lead_id||leadId||''; const start=e?local(e.starts_at):day(new Date())+'T10:00',end=e?local(e.ends_at):day(new Date())+'T10:30';
    modal(e?'Update appointment':'New appointment',`<input type="hidden" name="id" value="${esc(id)}"><label class="work-full">Lead<select name="lead_id" aria-label="Lead" ${e?'disabled':''} required><option value="">Choose a lead</option>${choices.map(l=>`<option value="${l.id}" ${l.id===picked?'selected':''}>${esc(l.name||'Unnamed lead')} · ${esc(l.company)}</option>`).join('')}${e&&!choices.some(l=>l.id===picked)?`<option value="${picked}" selected>${esc(e.lead_name)}</option>`:''}</select></label>${field('title','Title',e?.title||'','text',200)}<label>Type<select name="kind" aria-label="Type">${options(['meeting','demo','call','follow_up'],e?.kind||'meeting')}</select></label>${field('starts_at','Start (PKT)',start,'datetime-local')}${field('ends_at','End (PKT)',end,'datetime-local')}<label>Status<select name="status" aria-label="Status">${options(['scheduled','confirmed','completed','cancelled','no_show'],e?.status||'scheduled')}</select></label>${field('location','Location or meeting link',e?.location||'','text',500)}<label class="work-full">Notes<textarea name="notes" maxlength="4000">${esc(e?.notes)}</textarea></label>${e?'<label class="work-full">Meeting outcome<textarea name="outcome" maxlength="2000" placeholder="What happened, and what should happen next?"></textarea></label><p class="work-muted work-full">Changing a meeting status does not change the lead’s sales stage.</p>':''}`,'event');
  }
  async function click(ev){const b=ev.target.closest('[data-work]');if(!b)return;const a=b.dataset.work,id=b.dataset.id;
    try{
      if(a==='close')return document.getElementById('work-dialog')?.close();
      if(a==='refresh')return load();
      if(a==='new-lead')return editLead();
      if(a==='lead'){const g=gen;const d=await host.api('/leads/'+id);if(g===gen){detail=d;render();}return;}
      if(a==='back'){detail=null;return load();}
      if(a==='edit-lead')return editLead(detail.lead);
      if(a==='new-event'||a==='event'||a==='book')return await editEvent(a==='event'?id:null,a==='book'?id:null);
      if(a==='conversation')return host.conversation(id);
      if(a==='previous-page'||a==='next-page'){offset=Math.max(0,offset+(a==='next-page'?50:-50));return load();}
      if(a==='export')return host.download('/calendar/export?'+query(),'meetings-'+month+'.ics');
      if(a==='today')month=day(new Date()).slice(0,7);
      if(a==='previous-month'||a==='next-month'){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+(a==='next-month'?1:-1),1)).toISOString().slice(0,7);}
      return load();
    }catch(e){host.error?.(e);host.toast(e.message,true);}
  }
  async function submit(ev){ev.preventDefault();const f=ev.target;if(!f.dataset.form)return;
    if(f.dataset.form==='search'){search=f.elements.q.value.trim();offset=0;return load();}
    const b=Object.fromEntries(new FormData(f)),id=b.id;delete b.id;const save=f.querySelector('[type="submit"]');save.disabled=true;const g=gen;
    try{
      if(f.dataset.form==='event'){
        b.starts_at+=(b.starts_at.length===16?':00':'')+'+05:00';b.ends_at+=(b.ends_at.length===16?':00':'')+'+05:00';
        if(id){delete b.lead_id;await host.api('/calendar/'+id,{method:'PATCH',body:JSON.stringify(b)});}
        else await host.api('/calendar',{method:'POST',body:JSON.stringify({...b,channel:'manual'})});
      }else{
        if(b.next_action_at)b.next_action_at+=':00+05:00';else if(id)b.next_action_at=null;
        if(id)await host.api('/leads/'+id,{method:'PATCH',body:JSON.stringify(b)});
        else{const saved=await host.api('/leads',{method:'POST',body:JSON.stringify(b)});detail=await host.api('/leads/'+saved.lead.id);}
      }
      if(g!==gen)return;document.getElementById('work-dialog')?.close();host.toast('Saved');await load(true);
    }catch(e){if(g!==gen)return;host.error?.(e);const err=f.querySelector('[role="alert"]');if(err)err.textContent=e.message;save.disabled=false;}
  }
  function change(ev){const key=ev.target.dataset.filter;if(!key)return;const v=ev.target.value;if(key==='mode'){mode=v;return render();}if(key==='month'){if(!/^\d{4}-\d{2}$/.test(v))return;month=v;}if(key==='stage'){stage=v;offset=0;}if(key==='channel')channel=v;if(key==='status')status=v;load();}
  function unmount(){gen++;clearInterval(timer);busy=false;root=null;document.getElementById('work-dialog')?.remove();}
  function reset(){unmount();leads=[];summary={};events=[];detail=null;search='';stage='';channel='';status='';offset=0;total=0;error='';month=day(new Date()).slice(0,7);}
  function mount(el,cfg,tab){unmount();root=el;host=cfg;view=tab;detail=null;root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('submit',submit);load();timer=setInterval(()=>{if(!document.hidden&&!document.querySelector('#work-dialog[open]')&&!root?.querySelector('input:focus,textarea:focus'))load(true);},30000);}
  async function promote(contact,apiCall){const saved=await (apiCall||host.api)('/leads',{method:'POST',body:JSON.stringify({contact_key:contact.key,name:contact.name||'',company:contact.company||'',phone:contact.phone||'',email:contact.email||'',notes:contact.notes||'',source:contact.channels?.[0]||'manual'})});return saved.lead.id;}
  async function openLead(id){const g=gen;const d=await host.api('/leads/'+id);if(g===gen){detail=d;render();}}
  return {mount,unmount,reset,promote,openLead};
})();
