// Render the real portal templates without a session or a production database.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/portal.html'),'utf8');
const code=source.slice(source.indexOf('<script>')+8,source.lastIndexOf('</script>')).replace(/\nboot\(\);\s*$/,'');
const nodes={app:{innerHTML:''},lg_user:{focus(){}},'invoice-modal-root':{innerHTML:''}};
let requests=0;
const ctx=vm.createContext({console,Intl,Date,URLSearchParams,Blob,URL,setTimeout,clearTimeout,
 window:{addEventListener(){}},navigator:{userAgent:'test',platform:'test'},
 localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
 document:{referrer:'',getElementById:id=>nodes[id]||null,querySelectorAll:()=>[]},
 requestAnimationFrame(){},history:{replaceState(){}},location:{pathname:'/',search:''},
 fetch(){requests++;throw Error('No network in template checks');},confirm:()=>false});
vm.runInContext(code,ctx);
vm.runInContext("renderLogin('<img src=x onerror=alert(1)>')",ctx);
assert.match(nodes.app.innerHTML,/auth-layout/);
assert.match(nodes.app.innerHTML,/for="lg_user"/);
assert.match(nodes.app.innerHTML,/for="lg_pass"/);
assert.match(nodes.app.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(nodes.app.innerHTML,/portal-navigation/,'sign-in exposes no account navigation');
vm.runInContext(`data={account:{company:'Test <script>',contact_name:'Test',stage:'active',package:null,service:{status:'active'},surveys_enabled:false},ledger:{total_outstanding:0,total_paid:0,entries:[]},invoices:[],agents:[],contracts:[],quotes:[]};render();`,ctx);
assert.match(nodes.app.innerHTML,/Test &lt;script&gt;/);
assert.match(nodes.app.innerHTML,/aria-label="Account navigation"/);
assert.match(nodes.app.innerHTML,/portal-main/);
assert.match(nodes.app.innerHTML,/Account overview/);
assert.doesNotMatch(nodes.app.innerHTML,/setTab\('surveys'\)/,'disabled Echo stays hidden');
assert.doesNotMatch(nodes.app.innerHTML,/setTab\('contracts'\)/,'empty contracts stay hidden');
vm.runInContext("setTab('invoices')",ctx);
assert.match(nodes.app.innerHTML,/aria-current="page">[^]*?Invoices/);
assert.match(nodes.app.innerHTML,/No invoices yet/);
vm.runInContext("setTab('surveys')",ctx);
assert.match(nodes.app.innerHTML,/Account overview/,'disabled Echo returns to overview');
vm.runInContext("data.account.service={status:'suspended',reason:'Test pause'};setTab('security')",ctx);
assert.match(nodes.app.innerHTML,/Your service is paused/,'pause notice survives every page heading');
assert.match(nodes.app.innerHTML,/Change your password/);
assert.equal(requests,0,'visual templates make no new account requests');
console.log('Workspace UI checks passed: sign-in fields, escaping, portal navigation, conditional features, and service notices.');
