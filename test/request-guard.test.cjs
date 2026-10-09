const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function loadGuard(){const ctx={exports:{},require,Request,Response,Date,Map,TextDecoder,Uint8Array,Error};vm.runInNewContext(transpile('lib/request-guard.ts'),ctx);return ctx.exports;}
(async()=>{
 const guard=loadGuard();
 const request=ip=>new Request('https://www.vantriqai.com/api/contact',{headers:{'x-forwarded-for':ip}});
 for(let i=0;i<5;i++)assert.equal(guard.limitPublicRequest(request('192.0.2.1'),'test',5,10),null);
 assert.equal(guard.limitPublicRequest(request('192.0.2.1'),'test',5,10).status,429);
 for(let i=2;i<6;i++)assert.equal(guard.limitPublicRequest(request('192.0.2.'+i),'test',5,10),null);
 assert.equal(guard.limitPublicRequest(request('192.0.2.6'),'test',5,10).status,429);
 let canceled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(600));c.enqueue(new Uint8Array(600));},cancel(){canceled=true;}});
 await assert.rejects(()=>guard.readBoundedBody(new Request('https://example.test',{method:'POST',body:stream,duplex:'half'}),1000),/Payload too large/);assert.equal(canceled,true);
 assert.equal(await guard.readBoundedBody(new Request('https://example.test',{method:'POST',body:'hello'}),5),'hello');
 await assert.rejects(()=>guard.readBoundedBody(new Request('https://example.test',{method:'POST',body:'hello',headers:{'content-length':'5000'}}),1000),/Payload too large/);
 let forwarded=[];const contactGuard=loadGuard();const route={exports:{},require:p=>p==='../../../lib/request-guard'?contactGuard:require(p),Request,Response,AbortSignal,URL,Date,JSON,Error,console,process:{env:{CRM_WEBHOOK_URL:'https://crm.example',CRM_WEBHOOK_KEY:'test-key'}},fetch:async(url,opts)=>{forwarded.push({url,opts});return new Response('{}',{status:200});}};
 vm.runInNewContext(transpile('app/api/contact/route.ts'),route);
 const contact=(body,ip='192.0.2.9')=>new Request('https://www.vantriqai.com/api/contact',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body});
 assert.equal((await route.exports.POST(contact('[]'))).status,400);
 assert.equal((await route.exports.POST(contact('x'.repeat(16001)))).status,413);
 assert.equal(forwarded.length,0);
 assert.equal((await route.exports.POST(contact(JSON.stringify({name:'Customer',email:'customer@example.test'})))).status,200);assert.equal(forwarded.length,1);
 assert.equal(forwarded[0].opts.headers['x-api-key'],'test-key');
 for(let i=0;i<2;i++)assert.equal((await route.exports.POST(contact(JSON.stringify({company_website:'bot'})))).status,200);
 assert.equal((await route.exports.POST(contact('{}'))).status,429);assert.equal(forwarded.length,1);
 console.log('PASS: per-client/global abuse caps, bounded streaming bodies, canceled oversize requests, contact validation and server-only credentials.');
})().catch(e=>{console.error(e);process.exitCode=1;});
