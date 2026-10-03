const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const nodes={};let calls=[];
const ctx=vm.createContext({window:{VQC:{customers:true},matchMedia:()=>({matches:process.env.MOBILE_UI_TEST==='1'})},Intl,Date,URLSearchParams,TextEncoder,console,setTimeout,
 currentView:'calendar',openModal:null,openPanel:null,
 state:{clients:[{id:'lead-a',name:'Ayesha <script>',company:'Acme',ownerRepId:'rep-a'}],reps:[{id:'rep-a',name:'Ali',active:true}]},
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 isAdmin:()=>true,repNameOf:()=> 'Ali',iconX:()=>'',render:()=>{},loadState:async()=>{},closeModal:()=>{ctx.openModal=null;},showToast:()=>{},
 document:{getElementById:id=>nodes[id]||(nodes[id]={value:'',disabled:false,textContent:''})},
 API:{get:async url=>{calls.push(url);return url.includes('assignment-history')?[]:[{id:'event-a',client_id:'lead-a',title:'Demo <script>',starts_at:'2026-10-05T05:00:00Z',ends_at:'2026-10-05T05:30:00Z',kind:'demo',status:'scheduled',lead_name:'Ayesha',company:'Acme',owner_rep_id:'rep-a',rep_name:'Ali',channel:'website',notes:'',location:'',created_by:'AI agent'}];},post:async(url,body)=>{calls.push({url,body});},patch:async()=>{}}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/calendar-view.js'),'utf8'),ctx);
const ui=ctx.window.VQCAL;
(async()=>{
 assert.equal(ctx.window.VQC.customers,true,'calendar does not overwrite the existing Customers UI');
 ui.filter('month','2026-10');ui.renderCalendar();await new Promise(r=>setImmediate(r));
 const initial=ui.renderCalendar();
 if(process.env.MOBILE_UI_TEST==='1'){assert.match(initial,/<option value="agenda" selected>/);assert.match(initial,/calendar-agenda-card/);assert.match(initial,/VQCAL.openEvent\('event-a'\)/);}
 else assert.match(initial,/<option value="month" selected>/);
 ui.filter('mode','month');
 const html=ui.renderCalendar();assert.match(html,/Demo &lt;script&gt;/);assert.match(html,/Ali · website/);assert.match(html,/Pakistan/);
 ui.filter('mode','agenda');assert.match(ui.renderCalendar(),/10:00–10:30/,'UTC timestamps display in Pakistan time');
 ui.openEvent('event-a');assert.match(ui.eventModal(),/Edit lead/);assert.match(ui.eventModal(),/Assign \/ history/);assert.match(ui.eventModal(),/Delete lead/);
 ctx.isAdmin=()=>false;assert.doesNotMatch(ui.eventModal(),/Delete lead/);ctx.isAdmin=()=>true;
 ui.editLead('lead-a');assert.equal(ctx.openModal.type,'client');assert.equal(ctx.openModal.id,'lead-a');
 ui.openEvent('event-a');assert.match(ui.eventModal(),/2026-10-05T10:00/);assert.match(ui.eventModal(),/ce_status/);
 ui.openEvent(null,'lead-a','2026-10-05');assert.match(ui.eventModal(),/Ayesha &lt;script&gt;/);
 for(const [id,value] of Object.entries({ce_title:'Follow-up',ce_start:'2026-10-05T14:00',ce_end:'2026-10-05T14:30',ce_kind:'follow_up',ce_status:'scheduled',ce_location:'',ce_notes:'',ce_lead:'lead-a'}))nodes[id]={value};
 await ui.saveEvent();const posted=calls.find(c=>c.body);assert.equal(posted.body.starts_at,'2026-10-05T14:00+05:00');assert.equal(posted.body.client_id,'lead-a');
 await ui.assign('lead-a');assert.match(ui.assignmentModal(),/Current owner/);assert.match(ui.assignmentModal(),/Assignment history/);assert.match(ui.assignmentModal(),/Reason for assignment/);
 ui.reset();assert.match(ui.renderCalendar(),/Loading calendar/,'sign-out clears cached calendar data');
 console.log('Calendar UI checks passed: Customers coexistence, month/agenda rendering, escaping, PKT booking payload, assignment form, and cache reset.');
})().catch(e=>{console.error(e);process.exitCode=1;});
