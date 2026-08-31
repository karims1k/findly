import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 800 } });

await page.goto("http://localhost:3000");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/mobile-home.png", fullPage: true });

await page.fill('input[type="text"]', "CeraVe Moisturizing Cream");
await page.click('button[type="submit"]');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/mobile-results.png", fullPage: true });

await browser.close();
console.log("done");
