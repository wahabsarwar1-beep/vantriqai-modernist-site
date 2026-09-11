const { chromium } = require('playwright-core');
const fs=require('fs');
const [U,P]=fs.readFileSync('/tmp/actcred.txt','utf8').trim().split(/\s+/);
const B='http://127.0.0.1:8099';
let pass=0,fail=0;
const ok=(c,m,x='')=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m+(c?'':'  <<< '+x));};
(async()=>{
  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const page=await br.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(B+'/portal.html',{waitUntil:'networkidle'});
  await page.fill('#lg_user',U); await page.fill('#lg_pass',P);
  await page.click('button:has-text("Sign in")'); await page.waitForTimeout(2500);
  ok(/Kappa Ltd/.test(await page.locator('body').innerText()),'signed in to the portal');

  ok(await page.locator('.tab:has-text("Activity")').count()===1,'Activity tab present');
  await page.click('.tab:has-text("Activity")'); await page.waitForTimeout(2000);
  const t = await page.locator('.content').innerText();
  ok(/conversations this period/i.test(t),'activity summary rendered',t.slice(0,120));
  ok(/\b3\b/.test(t),'shows 3 sessions for this month',t.slice(0,200));
  ok(/WhatsApp/.test(t) && /Web chat/.test(t),'channels labelled in plain language');
  ok(/30 min/.test(t),'multi-turn session shows its length',t.slice(0,300));
  ok(/under a minute/.test(t),'single-turn session reads sensibly');
  ok(!/923111|923222|923333/.test(t),'no end-customer phone numbers on screen','LEAKED');
  ok(!/AI model|Claude|GPT|Gemini|DeepSeek/i.test(t),'no AI model exposed');

  // month switch
  const opts = await page.locator('.content select option').allInnerTexts();
  ok(opts.length===2,'both periods offered in the selector',JSON.stringify(opts));
  await page.selectOption('.content select', {index:1}); await page.waitForTimeout(2000);
  const t2 = await page.locator('.content').innerText();
  ok(/Jul/.test(t2),'switching period loads the earlier month',t2.slice(0,160));
  ok(/\b2\b/.test(t2),'earlier month shows 2 sessions');

  if(errs.length) console.log('  page errors:',errs.slice(0,3));
  console.log(`\n==== activity UI: ${pass} passed, ${fail} failed ====`);
  await br.close(); process.exit(fail?1:0);
})();
