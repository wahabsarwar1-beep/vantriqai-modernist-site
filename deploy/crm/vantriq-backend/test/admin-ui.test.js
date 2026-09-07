const { chromium } = require('playwright-core');
const fs = require('fs');
const KEY = fs.readFileSync('/tmp/adminkey','utf8').trim();
const B='http://127.0.0.1:8099';
const U = Date.now().toString().slice(-8);          // unique per run
const CO = 'Epsilon '+U;
let pass=0,fail=0;
const ok=(c,m,x='')=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+x));};

(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const page=await browser.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  const dialogs=[]; page.on('dialog',async d=>{ dialogs.push({type:d.type(),msg:d.message()}); await d.accept('Moving forward after a good call'); });

  await page.goto(B, {waitUntil:'networkidle'});
  await page.fill('#conn_base', B); await page.fill('#conn_key', KEY);
  await page.click('button:has-text("Connect")'); await page.waitForTimeout(2500);
  ok(!(await page.locator('#conn_key').count()), 'connected to the CRM');

  // ---- Products & Pricing: standard tiers locked
  await page.getByText('Products & Pricing',{exact:true}).first().click(); await page.waitForTimeout(1200);
  const prod = await page.locator('body').innerText();
  ok(/Fixed by the business model/.test(prod), 'standard packages show as fixed', prod.slice(0,150));
  ok(/The ladder is fixed/.test(prod), 'no "add a new package" tile');
  const editBtns = await page.locator('button:has-text("Edit")').count();
  ok(editBtns===1, 'exactly one package is editable (Enterprise+)', 'found '+editBtns);
  ok(!(await page.locator('button:has-text("New package")').count()), 'no New package button in the topbar');

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
  await page.getByText('Package Requests',{exact:true}).first().click(); await page.waitForTimeout(1200);
  const rq = await page.locator('body').innerText();
  ok(/Requested/.test(rq) && /Approve/.test(rq), 'pending portal request listed for the admin', rq.slice(0,200));
  ok(await page.locator('button:has-text("Approve")').count()>0, 'approve button present');
  await page.click('button:has-text("Approve")'); await page.waitForTimeout(2200);
  const after = await page.locator('body').innerText();
  ok(/No package requests waiting/.test(after), 'request clears after approving', after.slice(0,200));

  if(errs.length) console.log('  page errors:', errs.slice(0,4));
  console.log(`\n==== admin UI: ${pass} passed, ${fail} failed ====`);
  await browser.close(); process.exit(fail?1:0);
})();
