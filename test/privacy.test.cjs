const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 let data=null,calls=[];const ctx={exports:{},localStorage:{getItem:()=>data,setItem:(_,v)=>data=v},window:{dispatchEvent:()=>{}},location:{pathname:'/global/products/private?email=private'},Event:class{},Date,Number,JSON,fetch:(url,opts)=>{calls.push(JSON.parse(opts.body));return Promise.resolve({ok:true})}};vm.runInNewContext(transpile('lib/site-analytics.ts'),ctx);const a=ctx.exports;
 a.trackSiteEvent('page_view');assert.equal(calls.length,0);a.savePreferences(false);a.trackSiteEvent('chat_open');assert.equal(calls.length,0);a.savePreferences(true);a.trackSiteEvent('page_view');assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{consent:true,event:'page_view',region:'global',section:'products'});a.savePreferences(false);a.trackSiteEvent('brief_sent');assert.equal(calls.length,1);data=JSON.stringify({version:1,analytics:true,savedAt:Date.now()-181*86400000});a.trackSiteEvent('page_view');assert.equal(calls.length,1);data='corrupt';assert.equal(a.readPreferences(),null);
 const env={CRM_WEBHOOK_URL:'https://crm.example',CRM_WEBHOOK_KEY:'test-only-server-key'};let forwarded=null;
 const route={exports:{},Request,Response,AbortSignal,URL,Date,Map,JSON,process:{env},fetch:async(url,opts)=>{forwarded={url,body:JSON.parse(opts.body)};return {ok:true}}};vm.runInNewContext(transpile('app/api/analytics/route.ts'),route);
 const req=(body,origin='https://site.example')=>new Request('https://site.example/api/analytics',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route.exports.POST(req({consent:false,event:'page_view',section:'home',region:'pk'}))).status,400);assert.equal(forwarded,null);
 assert.equal((await route.exports.POST(req({consent:true,event:'page_view',section:'home',region:'pk'},'https://evil.example'))).status,403);
 assert.equal((await route.exports.POST(req({consent:true,event:'page_view',section:'home',region:'pk',email:'private'}))).status,400);
 assert.equal((await route.exports.POST(req({consent:true,event:'page_view',section:'home',region:'pk'}))).status,200);assert.deepEqual(JSON.parse(JSON.stringify(forwarded.body)),{event:'page_view',section:'home',region:'pk'});assert.ok(!JSON.stringify(forwarded.body).includes('key'));
 console.log('PASS: default/rejected/withdrawn/expired consent blocks analytics; fixed dimensions exclude URLs and PII; same-origin API, validation and credential separation.');
})().catch(e=>{console.error(e);process.exit(1)});
