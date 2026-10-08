const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Check the driver's final parameters, without connecting to any database.
const {Client}=require('pg');
for(const suffix of ['?sslmode=require&uselibpqcompat=true','?sslmode=disable&ssl=0','']){
 let options;
 class FakePool{constructor(value){options=value;}on(){}}
 const c={URL,require:()=>({Pool:FakePool}),module:{exports:{}},console,process:{env:{DATABASE_URL:'postgresql://test:test@database.example/crm'+suffix,DATABASE_SSL:'true'}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/db.js'),'utf8'),c);
 assert.equal(new Client(options).connectionParameters.ssl.rejectUnauthorized,true);
}
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
const nodes={};let loaded=0;let user={must_change_password:true,must_setup_totp:true,is_owner:true,totp_enabled:false};
const ctx={console,URL,clearInterval:()=>{},usagePollTimer:null,authUser:null,bootNotice:'',apiConnected:false,connectError:'',window:{location:{origin:'https://crm.example'}},
 document:{getElementById:id=>nodes[id]||(nodes[id]={innerHTML:'',value:''})},esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 API:{configured:()=>true,base:'https://crm.example',session:'test',clearConfig:()=>{},post:async(url,body)=>{
 if(url.endsWith('change-password')){assert.equal(body.current_password,'initial');assert.equal(body.new_password,'ReplacementPassword!');user={...user,must_change_password:false};}
 if(url.endsWith('totp/setup')){assert.equal(body.password,'ReplacementPassword!');return {secret:'TESTSECRET'};}
 if(url.endsWith('totp/confirm')){assert.equal(body.code,'123456');user={...user,totp_enabled:true,must_setup_totp:false};}
 return {ok:true};}},
 fetch:async()=>({ok:true,json:async()=>user}),loadState:async()=>{loaded++;},render:()=>{},startUsagePolling:()=>{},renderConnectScreen:()=>{},ApiError:class extends Error{}};
vm.createContext(ctx);
const start=html.indexOf('let requiredTotp = null;'),end=html.indexOf('\nboot();',start);vm.runInContext(html.slice(start,end),ctx);
(async()=>{
 await ctx.boot();assert.equal(loaded,0);assert.match(nodes.app.innerHTML,/security_new/);
 nodes.security_current={value:'initial'};nodes.security_new={value:'ReplacementPassword!'};await ctx.completeRequiredPassword();assert.equal(loaded,0);assert.match(nodes.app.innerHTML,/startRequiredTotp/);
 nodes.security_current.value='ReplacementPassword!';await ctx.startRequiredTotp();assert.match(nodes.app.innerHTML,/TESTSECRET/);assert.equal(loaded,0);
 nodes.security_code={value:'123456'};await ctx.completeRequiredTotp();assert.equal(loaded,1);
 for(const file of ['index.html','portal.html']){
 const source=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
 const helpers=source.slice(source.indexOf('function esc(s)'),source.indexOf('\n',source.indexOf('function safeHttpsUrl(s)')));
 const c={URL};vm.createContext(c);vm.runInContext(helpers,c);
 assert.equal(c.safeHttpsUrl('javascript:alert(1)'), '');assert.equal(c.safeHttpsUrl('https://user:pass@example.test'),'');assert.equal(c.safeHttpsUrl('https://example.test/doc'),'https://example.test/doc');
 const payload=`John');globalThis.pwned=true;//\\\"<script>`;
 const attr=c.jsArg(payload);const decoded=attr.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 c.capture=x=>assert.equal(x,payload);vm.runInContext('capture('+decoded+')',c);assert.equal(c.pwned,undefined);
 }
 console.log('Security UI checks passed: required password/MFA sequence loads no business data early; credential inputs, safe inline arguments and HTTPS links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
