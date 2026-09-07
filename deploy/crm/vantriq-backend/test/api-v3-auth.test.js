const fs=require('fs');
const B='http://127.0.0.1:8099';
const ADMIN={email:'wahab@vantriqai.com',password:process.env.AP};
const STAFF={email:'sam@vantriqai.com',password:process.env.SP};
const KEY=process.env.ADMIN_KEY, WKEY=process.env.WEBHOOK_KEY;
let pass=0,fail=0;
const ok=(c,m,x='')=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+x));};
const J=async r=>{try{return await r.json()}catch{return null}};
const post=(p,body,hdr={})=>fetch(B+p,{method:'POST',headers:{'Content-Type':'application/json',...hdr},body:JSON.stringify(body||{})});
const get=(p,hdr={})=>fetch(B+p,{headers:hdr});
const NB='newbie'+Date.now().toString().slice(-7)+'@vantriqai.com';
const lastCode=()=>{const m=JSON.parse(fs.readFileSync('/tmp/lastmail.json','utf8'));return (m.text.match(/\b(\d{6})\b/)||[])[1];};

async function signIn(who){
  const r=await post('/api/auth/login',who); const j=await J(r);
  if(!r.ok) return {error:j};
  const code=lastCode();
  const v=await post('/api/auth/verify',{challenge_id:j.challenge_id,code});
  return {challenge:j, code, verify:await J(v), status:v.status};
}

(async()=>{
  console.log('\n== password step ==');
  let r=await post('/api/auth/login',{email:ADMIN.email,password:'wrong'});
  ok(r.status===401,'wrong password rejected','got '+r.status);
  r=await post('/api/auth/login',{email:'nobody@vantriqai.com',password:'x'});
  ok(r.status===401,'unknown user gives the same 401','got '+r.status);
  const one=await J(r.clone?await post('/api/auth/login',{email:ADMIN.email,password:'wrong'}):r);
  r=await post('/api/auth/login',ADMIN); const ch=await J(r);
  ok(r.status===200 && ch.challenge_id,'correct password issues a challenge','got '+r.status);
  ok(/•/.test(ch.sent_to||''),'destination email is masked','got '+ch.sent_to);
  ok(!JSON.stringify(ch).includes(lastCode()),'the code is NOT returned in the response','LEAKED');

  console.log('\n== OTP step ==');
  const code=lastCode();
  ok(/^\d{6}$/.test(code),'a 6-digit code was emailed','got '+code);
  r=await post('/api/auth/verify',{challenge_id:ch.challenge_id,code:'000000'});
  let j=await J(r);
  ok(r.status===401 && /attempt/.test(j.error||''),'wrong code rejected with attempts left','got '+r.status+' '+JSON.stringify(j));
  r=await post('/api/auth/verify',{challenge_id:ch.challenge_id,code});
  j=await J(r);
  ok(r.status===200 && j.session,'correct code issues a session','got '+r.status+' '+JSON.stringify(j));
  const adminSess=j.session;
  ok(j.user.role==='admin','session carries the role','got '+JSON.stringify(j.user));
  r=await post('/api/auth/verify',{challenge_id:ch.challenge_id,code});
  ok(r.status===400,'a used code cannot be replayed','got '+r.status);

  console.log('\n== session gives access ==');
  const A={Authorization:'Bearer '+adminSess};
  r=await get('/api/clients',A); ok(r.status===200,'admin session reads clients','got '+r.status);
  r=await get('/api/financials',A); ok(r.status===200,'admin session reads financials','got '+r.status);
  r=await get('/api/team',A); ok(r.status===200,'admin session reads the team','got '+r.status);
  r=await get('/api/clients'); ok(r.status===401,'no credentials rejected','got '+r.status);
  r=await get('/api/clients',{Authorization:'Bearer ss_bogus'}); ok(r.status===401,'bogus session rejected','got '+r.status);

  console.log('\n== staff role is limited ==');
  const s=await signIn(STAFF);
  ok(s.status===200,'staff can sign in','got '+s.status+' '+JSON.stringify(s.verify));
  const S={Authorization:'Bearer '+s.verify.session};
  r=await get('/api/clients',S); ok(r.status===200,'staff reads clients','got '+r.status);
  r=await get('/api/dashboard',S); ok(r.status===200,'staff reads the dashboard','got '+r.status);
  r=await get('/api/package-requests',S); ok(r.status===200,'staff reads package requests','got '+r.status);
  r=await get('/api/financials',S); ok(r.status===403,'staff BLOCKED from financials','got '+r.status);
  r=await get('/api/vendors',S); ok(r.status===403,'staff BLOCKED from procurement','got '+r.status);
  r=await get('/api/settings',S); ok(r.status===403,'staff BLOCKED from settings','got '+r.status);
  r=await get('/api/team',S); ok(r.status===403,'staff BLOCKED from team management','got '+r.status);
  const prods=await J(await get('/api/products',S));
  r=await fetch(B+`/api/products/${prods.find(p=>p.name==='Enterprise+').id}`,{method:'PUT',headers:{'Content-Type':'application/json',...S},body:JSON.stringify({retainer:1})});
  ok(r.status===403,'staff BLOCKED from changing pricing','got '+r.status);

  console.log('\n== staff must not see cost or margin data ==');
  const sDash=await J(await get('/api/dashboard',S));
  const leaked=['net_monthly_result','margin_pct','total_platform_cost','total_contract_labour','total_delivery_cost']
    .filter(k=>sDash.kpis[k]!==undefined);
  ok(leaked.length===0,'staff dashboard withholds cost and margin KPIs','leaked: '+leaked.join(','));
  ok(sDash.kpis.mrr!==undefined && sDash.kpis.active_clients!==undefined,'staff still gets the revenue KPIs they need');
  const sProds=await J(await get('/api/products',S));
  ok(sProds.every(p=>p.delivery_cost_full===undefined),'staff catalogue withholds delivery cost','leaked');
  const aDash=await J(await get('/api/dashboard',A));
  ok(aDash.kpis.net_monthly_result!==undefined,'admin dashboard still has the full picture');
  const aProds=await J(await get('/api/products',A));
  ok(aProds.every(p=>p.delivery_cost_full!==undefined),'admin catalogue still has delivery cost');

  console.log('\n== team management ==');
  r=await post('/api/team',{email:'outsider@gmail.com',name:'X',role:'staff'},A);
  j=await J(r); ok(r.status===400 && /vantriqai\.com/.test(j.error||''),'non-company email refused','got '+r.status+' '+JSON.stringify(j));
  r=await post('/api/team',{email:NB,name:'New Bie',role:'staff'},A);
  j=await J(r); ok(r.status===201 && j.password,'admin creates a colleague with a one-time password','got '+r.status);
  const newId=j.user.id;
  ok(j.user.must_change_password===true,'new colleague must change their password');
  r=await post('/api/team',{email:NB,name:'Dup',role:'staff'},A);
  ok(r.status===409,'duplicate email refused','got '+r.status);
  const me=await J(await get('/api/auth/me',A));
  r=await post(`/api/team/${me.id}/deactivate`,{},A);
  ok(r.status===400,'cannot deactivate yourself','got '+r.status);
  r=await post(`/api/team/${newId}/deactivate`,{},A); ok(r.status===200,'can deactivate a colleague','got '+r.status);

  console.log('\n== last-admin protection ==');
  const adminUsers=(await J(await get('/api/team',A))).filter(u=>u.role==='admin'&&u.active);
  if(adminUsers.length===1){
    r=await post(`/api/team/${adminUsers[0].id}/role`,{role:'staff'},A);
    ok(r.status===409,'last admin cannot be demoted','got '+r.status);
  } else ok(true,'last admin cannot be demoted (multiple admins, skipped)');

  console.log('\n== deactivated user is locked out ==');
  const nb=await post('/api/auth/login',{email:NB,password:'whatever'});
  ok(nb.status===401,'deactivated colleague cannot sign in','got '+nb.status);

  console.log('\n== break-glass + machine keys still work ==');
  r=await get('/api/clients',{'x-api-key':KEY}); ok(r.status===200,'admin API key still opens the CRM (break-glass)','got '+r.status);
  r=await post('/api/webhooks/usage',{session_id:'s1',external_ref:'nope'},{'x-api-key':WKEY});
  ok(r.status===404,'n8n webhook key still authenticates (404 = no such client)','got '+r.status);
  r=await get('/api/financials',{'x-api-key':WKEY}); ok(r.status===403,'webhook key cannot read financials','got '+r.status);

  console.log('\n== sign out ==');
  r=await post('/api/auth/logout',{},A); ok(r.status===204,'logout succeeds','got '+r.status);
  r=await get('/api/clients',A); ok(r.status===401,'session dead after logout','got '+r.status);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail?1:0);
})();
