// Renders the cards in ads.html to PNG.
//   node render.js            all single cards and the carousel
//   node render.js 2 7 k3     just those (k1–k7 are carousel slides)
const { chromium } = require('playwright-core');

const CARDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const CAROUSEL = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'];

const fileFor = (id) => id.startsWith('k')
  ? `vantriqai-carousel-01-${id.slice(1)}.png`
  : `vantriqai-ad-${id.padStart(2, '0')}.png`;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...CARDS, ...CAROUSEL];
  for (const id of ids) {
    await p.goto(`file://${__dirname}/ads.html?c=${id}`);
    await p.evaluate(() => document.fonts.ready);
    // Space between the lowest content block and the footer; negative means they overlap.
    const gap = await p.evaluate(() => {
      const c = document.querySelector('.card.on');
      const foot = c.querySelector('.foot').getBoundingClientRect().top;
      const blocks = [...c.children].filter((e) => !e.matches('.foot, .grain, .contours, .blob, .rail, svg'));
      return Math.round(foot - Math.max(...blocks.map((e) => e.getBoundingClientRect().bottom)));
    });
    console.log(id.padEnd(4), fileFor(id).padEnd(32), 'gap above footer:', gap);
    await p.screenshot({ path: `${__dirname}/${fileFor(id)}` });
  }
  await b.close();
})();
