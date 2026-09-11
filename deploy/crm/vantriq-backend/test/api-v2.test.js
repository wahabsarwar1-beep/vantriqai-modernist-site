const B='http://127.0.0.1:8099';
const KEY=process.env.ADMIN_KEY;
let pass=0, fail=0;
const ok=(c,m,extra='')=>{ c?pass++:fail++; console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+extra)); };
const A=(p,o={})=>fetch(B+p,{...o,headers:{'Content-Type':'application/json','x-api-key':KEY,...(o.headers||{})}});
const P=(p,o={})=>fetch(B+p,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});
const j=async r=>{ try{return await r.json()}catch{return null} };

(async()=>{
  console.log('\n== packages: standard locked, Ent+ open ==');
  const prods=await j(await A('/api/products'));
  const starter=prods.find(p=>p.name==='Starter'), ep=prods.find(p=>p.name==='Enterprise+');
  let r=await A(`/api/products/${starter.id}`,{method:'PUT',body:JSON.stringify({retainer:1})});
  ok(r.status===403,'edit standard package blocked (403)','got '+r.status);
  r=await A(`/api/products/${ep.id}`,{method:'PUT',body:JSON.stringify({retainer:250000})});
  ok(r.status===200,'edit Enterprise+ allowed (200)','got '+r.status);
  r=await A('/api/products',{method:'POST',body:JSON.stringify({name:'Bespoke'})});
  ok(r.status===403,'creating new package blocked (403)','got '+r.status);
  r=await A(`/api/products/${starter.id}`,{method:'DELETE'});
  ok(r.status===403,'deleting standard package blocked (403)','got '+r.status);

  console.log('\n== clients: required fields ==');
  r=await A('/api/clients',{method:'POST',body:JSON.stringify({name:'X',company:'Y'})});
  const m=await j(r);
  ok(r.status===400 && /Required/.test(m.error||''),'partial client rejected (400)','got '+r.status+' '+JSON.stringify(m));
  const full={name:'Wahab Sarwar',company:'Acme Ltd',email:'a@acme.test',phone:'92300111',
    external_ref:'92300'+Date.now().toString().slice(-7),product_id:starter.id,stage:'lead',est_value:50000,source:'Referral'};
  r=await A('/api/clients',{method:'POST',body:JSON.stringify(full)});
  const client=await j(r);
  ok(r.status===201,'complete client created (201)','got '+r.status+' '+JSON.stringify(client));

  console.log('\n== stage rules ==');
  const mv=(id,stage,comment)=>A(`/api/clients/${id}`,{method:'PUT',body:JSON.stringify({stage,...(comment!==undefined?{stage_comment:comment}:{})})});
  r=await mv(client.id,'contacted'); ok(r.status===400,'forward without comment blocked (400)','got '+r.status);
  r=await mv(client.id,'proposal','skip'); ok(r.status===409,'skipping a stage blocked (409)','got '+r.status);
  r=await mv(client.id,'contacted','Called, keen'); ok(r.status===200,'forward one step with comment (200)','got '+r.status);
  r=await mv(client.id,'lead','undo'); ok(r.status===409,'moving backward blocked (409)','got '+r.status);
  for(const [s,c] of [['proposal','Sent proposal'],['negotiation','Discussing terms'],['active','Signed']]) {
    r=await mv(client.id,s,c); if(r.status!==200) ok(false,'advance to '+s,'got '+r.status+' '+JSON.stringify(await j(r)));
  }
  const after=await j(await A(`/api/clients/${client.id}`));
  ok(after.stage==='active','advanced through to active','stage='+after.stage);
  ok(!!after.join_date,'join_date stamped on active','join_date='+after.join_date);
  r=await mv(client.id,'lost','nope'); ok(r.status===409,'active cannot go to lost (409)','got '+r.status);
  r=await mv(client.id,'churned','Ended contract'); ok(r.status===200,'active can churn (200)','got '+r.status);
  r=await mv(client.id,'active','back'); ok(r.status===409,'churned is terminal (409)','got '+r.status);
  const hist=await j(await A(`/api/clients/${client.id}/stage-history`));
  ok(hist.length===6,'stage history has 6 entries (create + 5 moves)','got '+hist.length);
  ok(hist[0].comment==='Ended contract','latest history comment recorded','got '+JSON.stringify(hist[0]));

  console.log('\n== lost from a pre-active stage ==');
  const c2=await j(await A('/api/clients',{method:'POST',body:JSON.stringify({...full,external_ref:'92301'+Date.now().toString().slice(-7),company:'Beta Ltd'})}));
  r=await mv(c2.id,'lost','Went with a competitor'); ok(r.status===200,'lead -> lost allowed (200)','got '+r.status);

  console.log('\n== custom terms: Ent+ only ==');
  const c3=await j(await A('/api/clients',{method:'POST',body:JSON.stringify({...full,external_ref:'92302'+Date.now().toString().slice(-7),company:'Gamma Ltd'})}));
  r=await A(`/api/clients/${c3.id}`,{method:'PUT',body:JSON.stringify({custom_retainer:999})});
  ok(r.status===400,'custom terms on standard package blocked (400)','got '+r.status);
  r=await A(`/api/clients/${c3.id}`,{method:'PUT',body:JSON.stringify({product_id:ep.id,custom_retainer:999000,custom_quota:5000})});
  ok(r.status===200,'custom terms on Enterprise+ accepted (200)','got '+r.status+' '+JSON.stringify(await j(r)));

  console.log('\n== portal credentials + login ==');
  const cred=await j(await A(`/api/clients/${client.id}/portal-credentials`,{method:'POST'}));
  ok(!!cred.username && !!cred.password,'credentials generated','got '+JSON.stringify(cred));
  const listed=await j(await A(`/api/clients/${client.id}`));
  ok(listed.portal_password_hash===undefined,'password hash never returned to CRM','leaked!');
  ok(listed.portal_enabled===true,'portal_enabled flag exposed','got '+listed.portal_enabled);
  r=await P('/api/portal/login',{method:'POST',body:JSON.stringify({username:cred.username,password:'wrong'})});
  ok(r.status===401,'wrong password rejected (401)','got '+r.status);
  r=await P('/api/portal/login',{method:'POST',body:JSON.stringify({username:cred.username,password:cred.password})});
  const sess=await j(r);
  ok(r.status===200 && !!sess.session,'correct password issues a session','got '+r.status+' '+JSON.stringify(sess));
  const S=(p,o={})=>P(p,{...o,headers:{Authorization:'Bearer '+sess.session,...(o.headers||{})}});
  r=await P('/api/portal/account'); ok(r.status===401,'portal without session rejected (401)','got '+r.status);
  const acct=await j(await S('/api/portal/account'));
  ok(acct.company==='Acme Ltd','account returns own company','got '+JSON.stringify(acct).slice(0,120));
  ok(acct.package && acct.package.ai_model===undefined,'ai_model hidden from portal','LEAKED: '+JSON.stringify(acct.package));

  console.log('\n== portal packages + subscribe ==');
  const pk=await j(await S('/api/portal/packages'));
  ok(pk.packages.length===5,'only the 5 standard packages offered','got '+pk.packages.length);
  ok(pk.packages.every(p=>p.ai_model===undefined),'no ai_model in package list','leaked');
  ok(!pk.packages.some(p=>p.name==='Enterprise+'),'Enterprise+ not self-serve','listed');
  const growth=pk.packages.find(p=>p.name==='Growth');
  r=await S('/api/portal/subscribe',{method:'POST',body:JSON.stringify({product_id:growth.id,note:'Need more volume'})});
  ok(r.status===201,'subscribe raises a request (201)','got '+r.status+' '+JSON.stringify(await j(r)));
  r=await S('/api/portal/subscribe',{method:'POST',body:JSON.stringify({product_id:growth.id})});
  ok(r.status===409,'duplicate pending request blocked (409)','got '+r.status);
  r=await S('/api/portal/subscribe',{method:'POST',body:JSON.stringify({product_id:ep.id})});
  ok(r.status===400,'cannot self-subscribe to Enterprise+ (400)','got '+r.status);

  console.log('\n== admin approves the request ==');
  const reqs=await j(await A('/api/package-requests?status=pending'));
  ok(reqs.length===1,'pending request visible to admin','got '+reqs.length);
  const before=await j(await A(`/api/clients/${client.id}`));
  r=await A(`/api/package-requests/${reqs[0].id}/approve`,{method:'POST'});
  ok(r.status===200,'approve succeeds (200)','got '+r.status);
  const upd=await j(await A(`/api/clients/${client.id}`));
  ok(upd.product_id===growth.id,'client moved onto the approved package','before='+before.product_id+' after='+upd.product_id);
  r=await A(`/api/package-requests/${reqs[0].id}/approve`,{method:'POST'});
  ok(r.status===409,'re-approving blocked (409)','got '+r.status);

  console.log('\n== credential reset kills old sessions ==');
  await A(`/api/clients/${client.id}/portal-credentials`,{method:'POST'});
  r=await S('/api/portal/account'); ok(r.status===401,'old session invalid after reset (401)','got '+r.status);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail?1:0);
})();
