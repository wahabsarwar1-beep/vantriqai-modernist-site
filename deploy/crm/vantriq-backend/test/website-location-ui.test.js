// Real-browser rendering check; no live customer data or credentials required.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
(async()=>{
 const source=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
 const styles=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 const script=fs.readFileSync(require.resolve('../public/analytics-view.js'),'utf8');
 const data={range:'30d',period:{current_label:'Last 30 days'},website:{totals:{page_view:137,chat_open:15,whatsapp_click:9,brief_sent:2},
   countries:[{country:'PK',page_view:100},{country:'US',page_view:30},{country:'',page_view:7}],
   locations:[{country:'PK',subdivision:'PB',city:'Lahore',page_view:80,chat_open:10,whatsapp_click:5,brief_sent:1},{country:'PK',subdivision:'SD',city:'Karachi',page_view:20},{country:'US',subdivision:'CA',city:'Los Angeles',page_view:30},{country:'',subdivision:'',city:'',page_view:7}],
   sections:{home:{page_view:100},products:{page_view:37}},regions:{pk:{page_view:100},global:{page_view:37}},days:{'2026-10-03':{page_view:67},'2026-10-04':{page_view:70}}}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent(`<style>${styles} body{padding:16px;} #traffic{max-width:1250px;margin:auto;}</style><div id="traffic"></div><script>${script}</script><script>
     const trafficData=${JSON.stringify(data)};window.setWebsiteRange=r=>{trafficData.range=r;trafficData.period.current_label=r==='7d'?'Last 7 days':'Today';showTraffic();};
     window.downloadAnalyticsReport=()=>window.didDownload=true;
     function showTraffic(){VQA.injectStyles();document.getElementById('traffic').innerHTML=VQA.websiteTrafficHTML(trafficData,{onRange:'setWebsiteRange',onReport:'downloadAnalyticsReport'});}showTraffic();</script>`);
   assert.match(await page.innerText('#traffic'),/Pakistan/);assert.match(await page.innerText('#traffic'),/Lahore/);
   await page.getByRole('button',{name:'Last 7 days',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Last 7 days',exact:true}).getAttribute('aria-pressed'),'true');
   await page.getByRole('button',{name:'Download website report (Excel)'}).click();assert.equal(await page.evaluate(()=>window.didDownload),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No page overflow at ${width}px`);
   assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/vantriq-website-traffic-${width}.png`,fullPage:true});await page.close();
 }
 await browser.close();console.log('PASS: website traffic at desktop/mobile widths, country/city labels, filters, export control and no script errors.');
})().catch(e=>{console.error(e);process.exit(1)});
