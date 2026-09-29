import puppeteer from 'puppeteer';

async function testPort(port, name) {
  console.log(`\n--- Testing ${name} on port ${port} ---`);
  try {
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();
    page.on('console', msg => console.log(`[${name} CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.error(`[${name} ERROR]`, err));
    
    // Test base URL
    const res = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2' });
    console.log(`[${name}] Status:`, res.status());
    
    // Evaluate if there are any elements rendered
    const content = await page.evaluate(() => document.body.innerHTML);
    if (!content || content.length < 50) {
      console.log(`[${name}] Body content looks suspiciously empty!`);
    } else {
      console.log(`[${name}] Rendered successfully. Body length: ${content.length}`);
    }
    await browser.close();
  } catch (err) {
    console.error(`[${name} ERROR]`, err.message);
  }
}

async function main() {
  await testPort(4174, "Parent PWA");
  await testPort(4175, "Waste PWA");
  await testPort(4176, "Extracurricular PWA");
  await testPort(4177, "Library PWA");
}

main().catch(console.error);
