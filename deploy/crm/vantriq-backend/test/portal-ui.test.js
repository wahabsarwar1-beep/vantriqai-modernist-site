const { chromium } = require('playwright-core');
const fs = require('fs');
const [USER, PASSWORD] = fs.readFileSync('/tmp/cred.txt','utf8').trim().split('\n');
const B = 'http://127.0.0.1:8099';
let pass=0, fail=0;
const ok=(c,m,x='')=>{ c?pass++:fail++; console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+x)); };

(async()=>{
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await browser.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  page.on('dialog', d=>d.accept());

  // 1. bare portal shows a login screen, not an account
  await page.goto(B+'/portal.html', { waitUntil:'networkidle' });
  ok(await page.locator('#lg_user').count()===1, 'login screen shown with no session');
  const body0 = await page.locator('body').innerText();
  ok(!/Delta Ltd/.test(body0), 'no account data before signing in', body0.slice(0,80));

  // 2. an old-style token link must NOT open the account
  await page.goto(B+'/portal.html?t=pt_anythingatall', { waitUntil:'networkidle' });
  ok(await page.locator('#lg_user').count()===1, 'old ?t= link no longer opens an account');

  // 3. wrong password rejected
  await page.fill('#lg_user', USER); await page.fill('#lg_pass','wrongpass');
  await page.click('button:has-text("Sign in")'); await page.waitForTimeout(1200);
  const msg = await page.locator('#login-msg').innerText().catch(()=> '');
  ok(/incorrect/i.test(msg), 'wrong password shows an error', JSON.stringify(msg));
  ok(await page.locator('#lg_user').count()===1, 'still on the login screen after a bad password');

  // 4. correct password signs in
  await page.fill('#lg_user', USER); await page.fill('#lg_pass', PASSWORD);
  await page.click('button:has-text("Sign in")'); await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  ok(/Delta Ltd/.test(body), 'account loads after signing in', body.slice(0,120));
  ok(!/AI model/i.test(body), 'AI model not shown on overview', 'LEAKED');

  // 5. packages tab
  await page.click('.tab:has-text("Packages")'); await page.waitForTimeout(900);
  const pk = await page.locator('body').innerText();
  ok(/Starter/.test(pk) && /Growth/.test(pk), 'standard packages listed');
  ok(!/Enterprise\+/.test(pk.split('Need something beyond')[0]), 'Enterprise+ not offered as a choice');
  ok(!/AI model/i.test(pk), 'AI model not shown on packages', 'LEAKED');
  ok(/Your package/.test(pk), 'current package marked');

  // 6. request a change -> pending state
  const btns = page.locator('button:has-text("Request this package")');
  ok(await btns.count() > 0, 'request buttons present for other packages');
  await btns.first().click(); await page.waitForTimeout(1800);
  const after = await page.locator('body').innerText();
  ok(/Change requested/.test(after), 'pending banner appears after requesting', after.slice(0,160));
  ok(await page.locator('button:has-text("Request this package")').count()===0, 'request buttons hidden while one is pending');

  // 7. sign out clears the session
  await page.click('a:has-text("Sign out")'); await page.waitForTimeout(1200);
  ok(await page.locator('#lg_user').count()===1, 'signed out back to login');
  await page.reload({ waitUntil:'networkidle' });
  ok(await page.locator('#lg_user').count()===1, 'still signed out after reload');

  if(errs.length) console.log('  page errors:', errs.slice(0,3));
  console.log(`\n==== portal UI: ${pass} passed, ${fail} failed ====`);
  await browser.close();
  process.exit(fail?1:0);
})();
