import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

await page.goto("http://localhost:3000");
await page.fill('input[type="text"]', "Fenty Beauty Gloss Bomb Universal Lip Luminizer");
await page.click('button[type="submit"]');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/us-results.png", fullPage: true });

// test sort by rating
await page.click('button:text("rating")');
await page.waitForTimeout(300);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/us-sorted-rating.png", fullPage: true });

// test AE region
await page.selectOption("select", "AE");
await page.click('button[type="submit"]');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/ae-results.png", fullPage: true });

await browser.close();
console.log("done");
