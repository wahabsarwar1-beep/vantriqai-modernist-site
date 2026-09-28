const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['1','2','3','4','5','6'];
  for (const i of ids) {
    await p.goto(`file://${__dirname}/ads.html?c=${i}`);
    await p.evaluate(() => document.fonts.ready);
    const over = await p.evaluate(() => { const c=document.querySelector('.card.on'); const f=c.querySelector('.foot').getBoundingClientRect().top; const ctas=c.querySelectorAll('.cta, .src'); return [...ctas].map(e=>Math.round(f - e.getBoundingClientRect().bottom)); });
    console.log(i, 'gap cta->footer:', over);
    await p.screenshot({ path: `vantriqai-ad-0${i}.png` });
  }
  await b.close();
})();
