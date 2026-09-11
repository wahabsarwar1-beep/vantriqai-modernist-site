const { chromium } = require('playwright-core');
const fs=require('fs');
const B='http://127.0.0.1:8099';
const AP=process.env.AP, SP=process.env.SP;
let pass=0,fail=0;
const ok=(c,m,x='')=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+x));};
const code=()=>{const m=JSON.parse(fs.readFileSync('/tmp/lastmail.json','utf8'));return (m.text.match(/\b(\d{6})\b/)||[])[1];};

async function login(page,email,pw){
  await page.goto(B,{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.clear());
  await page.goto(B,{waitUntil:'networkidle'});
  await page.fill('#lg_email',email); await page.fill('#lg_pw',pw);
  await page.click('button:has-text("Continue")'); await page.waitForTimeout(1500);
  await page.fill('#otp_code', code());
  await page.click('button:has-text("Verify and sign in")'); await page.waitForTimeout(3000);
}

(async()=>{
  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const page=await br.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  page.on('dialog',d=>d.accept());

  await page.goto(B,{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.clear());
  await page.goto(B,{waitUntil:'networkidle'});
  ok(await page.locator('#lg_email').count()===1,'sign-in asks for email and password, not an API key');
  ok(await page.locator('#conn_key').count()===0,'no API key field on the default screen');
  ok(/Emergency access with an API key/.test(await page.locator('body').innerText()),'break-glass route is offered but de-emphasised');

  // wrong password
  await page.fill('#lg_email','wahab@vantriqai.com'); await page.fill('#lg_pw','nope');
  await page.click('button:has-text("Continue")'); await page.waitForTimeout(1500);
  ok(/Incorrect email or password/.test(await page.locator('body').innerText()),'wrong password rejected at step 1');
  ok(await page.locator('#otp_code').count()===0,'no OTP step reached with a bad password');

  // correct password -> OTP step
  await page.fill('#lg_email','wahab@vantriqai.com'); await page.fill('#lg_pw',AP);
  await page.click('button:has-text("Continue")'); await page.waitForTimeout(1500);
  ok(await page.locator('#otp_code').count()===1,'correct password advances to the code step');
  const masked=await page.locator('body').innerText();
  ok(/•/.test(masked),'the email address is masked on screen');
  ok(!masked.includes(code()),'the code itself is never shown in the browser','LEAKED');

  // wrong code
  await page.fill('#otp_code','000000'); await page.click('button:has-text("Verify and sign in")'); await page.waitForTimeout(1500);
  ok(/Incorrect code/.test(await page.locator('body').innerText()),'wrong code rejected');

  // right code
  await page.fill('#otp_code',code()); await page.click('button:has-text("Verify and sign in")'); await page.waitForTimeout(3000);
  let body=await page.locator('body').innerText();
  ok(/Dashboard/.test(body),'correct code signs in to the CRM',body.slice(0,120));
  ok(/wahab@vantriqai\.com/.test(body),'sidebar shows who is signed in');
  ok(/Admin/.test(body),'sidebar shows the role');
  ok(/Team/.test(body),'admin sees the Team nav item');
  ok(/Financials/.test(body),'admin sees Financials');

  // team screen
  await page.getByText('Team',{exact:true}).first().click(); await page.waitForTimeout(1800);
  body=await page.locator('.content').innerText();
  ok(/wahab@vantriqai\.com/.test(body),'team screen lists employees',body.slice(0,150));
  ok(/Add employee/.test(body),'admin can add an employee');
  await page.click('button:has-text("Add employee")'); await page.waitForTimeout(700);
  await page.fill('#tu_name','UI Tester'); await page.fill('#tu_email','uitest'+Date.now().toString().slice(-6)+'@vantriqai.com');
  await page.click('button:has-text("Create login")'); await page.waitForTimeout(2500);
  const creds=await page.locator('#new-user-creds').innerText().catch(()=> '');
  ok(/Password:/.test(creds),'new employee password shown once',creds.slice(0,120));
  ok(/Shown once/.test(creds),'warns the password is not recoverable');

  // reject a non-company address
  await page.click('button:has-text("Add employee")'); await page.waitForTimeout(700);
  await page.fill('#tu_name','Outsider'); await page.fill('#tu_email','someone@gmail.com');
  await page.click('button:has-text("Create login")'); await page.waitForTimeout(1500);
  ok(/vantriqai\.com/.test(await page.locator('.toast').innerText().catch(()=> '')),'non-company email refused in the UI');
  await page.click('button:has-text("Cancel")'); await page.waitForTimeout(500);

  // ---- staff login sees less
  await login(page,'sam@vantriqai.com',SP);
  body=await page.locator('body').innerText();
  ok(/Dashboard/.test(body),'staff signs in successfully',body.slice(0,120));
  ok(/Staff/.test(body),'sidebar shows the Staff role');
  {const nav=await page.locator('.sidebar').innerText(); ok(!/Team/.test(nav),'staff does NOT see Team in the nav',nav.replace(/\n/g,' ¦ '));}
  {const nav=await page.locator('.sidebar').innerText(); ok(!/Financials/.test(nav),'staff does NOT see Financials in the nav',nav.replace(/\n/g,' ¦ '));}
  {const nav=await page.locator('.sidebar').innerText(); ok(!/Procurement/.test(nav),'staff does NOT see Procurement in the nav',nav.replace(/\n/g,' ¦ '));}
  {const nav=await page.locator('.sidebar').innerText(); ok(!/Settings/.test(nav),'staff does NOT see Settings in the nav',nav.replace(/\n/g,' ¦ '));}
  ok(/Pipeline/.test(body) && /Clients/.test(body),'staff still sees pipeline and clients');

  // sign out
  await page.click('a:has-text("Sign out")'); await page.waitForTimeout(1500);
  ok(await page.locator('#lg_email').count()===1,'sign out returns to the sign-in screen');
  await page.reload({waitUntil:'networkidle'});
  ok(await page.locator('#lg_email').count()===1,'still signed out after a reload');

  if(errs.length) console.log('  page errors:',errs.slice(0,3));
  console.log(`\n==== staff auth UI: ${pass} passed, ${fail} failed ====`);
  await br.close(); process.exit(fail?1:0);
})();
