import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

await page.goto("http://localhost:3000");
await page.setInputFiles('input[type="file"]', "/tmp/test-product.jpg");
await page.waitForSelector("text=Matched from your photo", { timeout: 20000 });
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/photo-matched.png", fullPage: true });

await page.click('button[type="submit"]');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/photo-results.png", fullPage: true });

await browser.close();
console.log("done");
