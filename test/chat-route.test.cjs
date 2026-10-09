const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const guard={exports:{},require,Request,Response,Date,Map,TextDecoder,Uint8Array};vm.runInNewContext(transpile('lib/request-guard.ts'),guard);
const routeRequire=p=>p==='../../../lib/request-guard'?guard.exports:require(p);
(async()=>{
 let upstream=null,reply={status:200,body:JSON.stringify({output:'Hello'})};
 const route={exports:{},require:routeRequire,Request,Response,AbortSignal,URL,Date,Map,JSON,console:{error(){}},process:{env:{N8N_CHAT_WEBHOOK_URL:'https://n8n.example/chat'}},fetch:async(url,opts)=>{upstream={url,opts,body:JSON.parse(opts.body)};return new Response(reply.body,{status:reply.status})}};
 vm.runInNewContext(transpile('app/api/chat/route.ts'),route);const POST=route.exports.POST;
 const req=(body,origin='https://www.vantriqai.com',host='internal:3000')=>new Request(`http://${host}/api/chat`,{method:'POST',headers:{origin,host,'content-type':'application/json'},body:JSON.stringify(body)});
 const ok={sessionId:'0b6f3c1e-1111-4a2b-9c3d-123456789abc',chatInput:' Do you work with restaurants? '};
 // Forwarded server-side with the allow-listed Origin, input trimmed.
 let res=await POST(req(ok));assert.equal(res.status,200);assert.deepEqual(await res.json(),{output:'Hello'});
 assert.equal(upstream.url,'https://n8n.example/chat');assert.equal(upstream.opts.headers.Origin,'https://www.vantriqai.com');
 assert.deepEqual(upstream.body,{action:'sendMessage',sessionId:ok.sessionId,chatInput:'Do you work with restaurants?'});
 // The page's own host is accepted (preview domains); other sites are not.
 upstream=null;assert.equal((await POST(req(ok,'https://preview.example','preview.example'))).status,200);
 upstream=null;assert.equal((await POST(req(ok,'https://evil.example'))).status,403);assert.equal(upstream,null);
 // Malformed sessions and empty messages never reach n8n.
 assert.equal((await POST(req({sessionId:'<script>',chatInput:'x'}))).status,400);assert.equal((await POST(req({sessionId:ok.sessionId,chatInput:'  '}))).status,400);assert.equal(upstream,null);
 // n8n refusing, or replying without output, is a 502 — never relayed as a reply.
 reply={status:403,body:'origin not allowed'};assert.equal((await POST(req(ok))).status,502);
 reply={status:200,body:'<!DOCTYPE html>'};assert.equal((await POST(req(ok))).status,502);
 reply={status:200,body:JSON.stringify([{output:'From array'}])};assert.deepEqual(await (await POST(req(ok))).json(),{output:'From array'});
 console.log('PASS: chat relay is same-origin only, validates input, forwards with the allow-listed Origin, and never relays an n8n refusal or HTML as a reply.');
})().catch(e=>{console.error(e);process.exit(1)});
