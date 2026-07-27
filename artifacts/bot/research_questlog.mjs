import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('response', async response => {
    const url = response.url();
    const type = response.request().resourceType();
    
    if (type === 'fetch' || type === 'xhr' || url.includes('.json')) {
      console.log('Response URL:', url);
      try {
        const text = await response.text();
        if (text.includes('events') || text.includes('schedule') || text.includes('boss')) {
          console.log('--- FOUND POTENTIAL API DATA ---');
          console.log('URL:', url);
          console.log('Snippet:', text.substring(0, 500));
          console.log('--------------------------------');
        }
      } catch (e) {
      }
    }
  });

  console.log("Navigating to page...");
  await page.goto('https://questlog.gg/throne-and-liberty/en/event-calendar?view=events&levelMax=50&date=2026-07-27&regionId=ko&serverId=23', { waitUntil: 'networkidle2' });
  console.log("Done.");
  await browser.close();
})();
