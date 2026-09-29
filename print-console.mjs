import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE EXCEPTION:', error.message);
  });

  try {
    await page.goto('http://localhost:4174/#token=b5fdac803ba552e60c0670a24a6497510c1cf686812cee8c2e671969c44c7b7d', { waitUntil: 'networkidle0' });
  } catch (e) {
    console.log('GOTO ERROR:', e.message);
  }

  await browser.close();
})();
