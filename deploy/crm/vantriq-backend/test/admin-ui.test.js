const { chromium } = require('playwright-core');
const fs = require('fs');
const { signInAsAdmin, endUiSessions } = require('./ui-session');
const KEY = fs.readFileSync('/tmp/adminkey','utf8').trim();
const B='http://127.0.0.1:8099';
const U = Date.now().toString().slice(-8);          // unique per run
const CO = 'Epsilon '+U;
let pass=0,fail=0;
const ok=(c,m,x='')=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+x));};

(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const page=await browser.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  const dialogs=[]; page.on('dialog',async d=>{ dialogs.push({type:d.type(),msg:d.message()}); await d.accept('Moving forward after a good call'); });

  // Signed in as an admin (v9.22: the admin key alone no longer opens the
  // page; emergency access has its own test, breakglass.test.js).
  await page.goto(B, {waitUntil:'networkidle'});
  await signInAsAdmin(page);
  await page.goto(B, {waitUntil:'networkidle'}); await page.waitForTimeout(1500);
  ok(await page.locator('.sidebar').count()===1, 'signed in to the CRM');

  // ---- Products & Pricing and Financials are the CEO's (v9.21): another
  // admin opens everything else, not these. The CEO's own view is tested in
  // test/pricing-ceo.test.js.
  const nav = await page.locator('nav, .sidebar, aside').first().innerText().catch(()=> '');
  ok(!/Products & Pricing/.test(nav) && !/Financials/.test(nav), 'no Products & Pricing or Financials for another admin', nav.slice(0,200));

  // ---- Clients: required-field validation
  await page.getByText('Clients',{exact:true}).first().click(); await page.waitForTimeout(1000);
  await page.click('button:has-text("Add client")'); await page.waitForTimeout(700);
  await page.fill('#f_name','Only A Name');
  await page.click('button:has-text("Save")'); await page.waitForTimeout(900);
  let toast = await page.locator('.toast').innerText().catch(()=> '');
  ok(/Required/i.test(toast), 'incomplete client blocked with a Required message', JSON.stringify(toast));
  ok(await page.locator('#f_name').count()===1, 'modal stays open on a validation failure');

  // fill it fully and save
  await page.fill('#f_company',CO); await page.fill('#f_email','e@eps.test');
  await page.fill('#f_phone','923000002'); await page.fill('#f_value','75000');
  await page.fill('#f_source','Referral'); await page.fill('#f_external_ref','9231'+U);
  await page.click('button:has-text("Save")'); await page.waitForTimeout(1800);
  ok(!(await page.locator('#f_name').count()), 'complete client saves and closes the modal');
  ok((await page.locator('body').innerText()).includes(CO), 'new client appears in the list');

  // ---- Stage rules in the edit modal
  await page.locator('tr').filter({hasText:CO}).first().click(); await page.waitForTimeout(900);
  await page.click('button:has-text("Edit")'); await page.waitForTimeout(800);
  const opts = await page.locator('#f_stage option').allInnerTexts();
  ok(opts.length===3, 'stage dropdown offers current + allowed only (3)', JSON.stringify(opts));
  ok(!opts.join('|').toLowerCase().includes('active'), 'cannot jump straight to Active', JSON.stringify(opts));
  await page.selectOption('#f_stage','contacted'); await page.waitForTimeout(400);
  const wrapVisible = await page.locator('#stage-comment-wrap').isVisible();
  ok(wrapVisible, 'comment box appears when the stage changes');
  await page.click('button:has-text("Save")'); await page.waitForTimeout(900);
  toast = await page.locator('.toast').innerText().catch(()=> '');
  ok(/comment is required/i.test(toast), 'save blocked without a comment', JSON.stringify(toast));
  await page.fill('#f_stage_comment','Spoke with their ops lead, keen to proceed');
  await page.click('button:has-text("Save")'); await page.waitForTimeout(1800);
  ok(!(await page.locator('#f_name').count()), 'saves once a comment is supplied');

  // ---- Portal credentials (the detail panel is still open from the edit above)
  const panel = await page.locator('#panel-root').innerText();
  ok(/Create portal login/.test(panel), 'panel offers to create a portal login', panel.slice(0,120));
  await page.click('button:has-text("Create portal login")'); await page.waitForTimeout(1800);
  const creds = await page.locator('#portal-link-area').innerText();
  ok(/Username:/.test(creds) && /Password:/.test(creds), 'username and password shown once', creds.slice(0,150));
  ok(/can never be shown again/.test(creds), 'warns the password is not recoverable');

  // ---- Package requests
  await page.locator('.scrim').first().click(); await page.waitForTimeout(600);   // close the panel
  await page.getByText('Package Requests',{exact:true}).first().click();
  // The list is fetched after the view renders, so wait for the table rather
  // than for a fixed delay — a fixed delay reads the page mid-load and the
  // failure looks like a missing feature.
  await page.waitForSelector('th:has-text("Requested")', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(600);
  const rq = await page.locator('body').innerText();
  // Case-insensitive: column headings are uppercased in CSS, and innerText
  // returns the transformed text, so /Requested/ never matches what is on
  // screen even when the request is plainly listed.
  ok(/requested/i.test(rq) && /approve/i.test(rq), 'pending portal request listed for the admin', rq.slice(0,200));
  ok(await page.locator('button:has-text("Approve")').count()>0, 'approve button present');
  await page.click('button:has-text("Approve")'); await page.waitForTimeout(2200);
  const after = await page.locator('body').innerText();
  ok(/No package requests waiting/.test(after), 'request clears after approving', after.slice(0,200));

  if(errs.length) console.log('  page errors:', errs.slice(0,4));
  console.log(`\n==== admin UI: ${pass} passed, ${fail} failed ====`);
  await browser.close(); await endUiSessions(); process.exit(fail?1:0);
})();
