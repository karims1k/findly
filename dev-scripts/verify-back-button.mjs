import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("http://localhost:3000");
await page.click('button:text("Worldwide")');
await page.click('button:has-text("Makeup")');
await page.waitForFunction(() => document.body.innerText.includes("Buy") || document.body.innerText.includes("Results for"), { timeout: 20000 });
await page.waitForTimeout(300);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/before-back.png", fullPage: true });

await page.click('button:text("← Back to categories")');
await page.waitForTimeout(300);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/after-back.png", fullPage: true });

await browser.close();
console.log("done");
