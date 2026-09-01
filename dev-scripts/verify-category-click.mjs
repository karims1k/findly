import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("http://localhost:3000");
await page.waitForSelector('button:has-text("Makeup")', { timeout: 10000 });
await page.click('button:has-text("Makeup")');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/category-search-result.png", fullPage: true });
await browser.close();
console.log("done");
