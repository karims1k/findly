import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("http://localhost:3000");
await page.setInputFiles('input[type="file"]', "/tmp/test-product2.jpg");
// Should go straight to results without a manual Compare click
await page.waitForFunction(
  () => document.body.innerText.includes("Buy") || document.body.innerText.includes("Results for"),
  { timeout: 20000 }
);
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/photo-autosearch.png", fullPage: true });
await browser.close();
console.log("done");
