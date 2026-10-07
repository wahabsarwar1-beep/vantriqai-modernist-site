const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const name of ['index','portal']){const html=fs.readFileSync('public/'+name+'.html','utf8');for(const s of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);assert.match(html,/workspace-insights.js/);assert.match(html,/workspace-intelligence.css/);assert.match(html,/VQINSIGHTS.mount/);assert.match(html,/VQINSIGHTS.reset/);}
let configs=[],destroyed=0;const root={innerHTML:'',listeners:{},addEventListener(k,f){this.listeners[k]=f;}};
const document={getElementById:id=>root.innerHTML.includes('id="'+id+'"')?{id}:null};
const ctx=vm.createContext({window:{matchMedia:()=>({matches:true})},Chart:class{constructor(el,c){configs.push(c);}destroy(){destroyed++;}},document,Intl,Date,URLSearchParams,console});
vm.runInContext(fs.readFileSync('public/workspace-insights.js','utf8'),ctx);const ui=ctx.window.VQINSIGHTS;
const data={summary:{leads:10,won:2,lost:1,engaged:6,proposed:3,won_share:20},pipeline:{open:7,due:2,age_0_7:2,age_8_30:3,age_31_60:1,age_61_plus:1},sources:[{source:'website',leads:8,won:1},{source:'<script>alert(1)</script>',leads:2,won:1}],appointments:{total:3,completion_rate:50},trend:[{day:'2026-10-01',total:3,completed:1,cancelled:1,no_show:0}],period:{from:'2026-09-08',to:'2026-10-07',trend_grain:'week'},generated_at:'2026-10-07T12:00:00Z'};
const settle=()=>new Promise(r=>setImmediate(r));let requests=[];
const host={audience:'crm',api:async q=>{requests.push(q);return data;},customers:[{id:'customer-a',company:'Acme <script>'}],navigate:()=>{}};
(async()=>{
ui.mount(root,host);await settle();assert.match(root.innerHTML,/Conversion funnel/);assert.match(root.innerHTML,/Pipeline ageing/);assert.match(root.innerHTML,/View chart data/);assert.match(root.innerHTML,/Snapshot by current stage/);assert.match(root.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(root.innerHTML,/<script>alert/);assert.equal(configs.length,2);assert.equal(configs[0].options.animation,false);assert.equal(configs[1].data.datasets[1].data[0],1);
root.listeners.change({target:{dataset:{insightFilter:'scope'},value:'customers'}});await settle();assert.match(root.innerHTML,/Acme &lt;script&gt;/);assert.match(requests.at(-1),/scope=customers/);
root.listeners.change({target:{dataset:{insightFilter:'customer'},value:'customer-a'}});await settle();assert.match(requests.at(-1),/client_id=customer-a/);
root.listeners.change({target:{dataset:{insightFilter:'days'},value:'90'}});await settle();assert.match(requests.at(-1),/days=90/);ui.reset();assert.ok(destroyed>=2);
requests=[];ui.mount(root,{...host,audience:'portal'});await settle();assert.equal(requests[0],'days=30');assert.doesNotMatch(root.innerHTML,/Insights workspace|Insights customer/);
let resolve;ui.mount(root,{...host,api:()=>new Promise(r=>resolve=r)});ui.reset();root.innerHTML='other account';resolve(data);await settle();assert.equal(root.innerHTML,'other account','late account response cannot repaint after reset');
const empty={...data,summary:{leads:0,won:0,lost:0,engaged:0,proposed:0,won_share:null},pipeline:{open:0,due:0,age_61_plus:0},sources:[],appointments:{total:0,completion_rate:null}};
ui.mount(root,{...host,audience:'portal',api:async()=>empty});await settle();assert.match(root.innerHTML,/Your funnel starts/);assert.match(root.innerHTML,/A clear pipeline/);assert.doesNotMatch(root.innerHTML,/id="insight-trend"/);ui.reset();
console.log('Workspace insight UI passed: both app integration syntax, chart datasets, accessible figures, escaped text, period/scope/customer controls, private portal controls, reduced motion, empty states and stale-account protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
