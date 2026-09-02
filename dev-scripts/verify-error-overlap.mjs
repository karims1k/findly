import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

await page.goto("http://localhost:3000");
await page.fill('input[type="text"]', "vacuum cleaner");
await page.click('button:has-text("Compare")');
await page.waitForTimeout(2000);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/error-no-overlap.png", fullPage: true });

const bodyText = await page.locator("body").innerText();
console.log("Shows error message:", bodyText.includes("only compares makeup"));
console.log("Shows 'Browse categories' at same time:", bodyText.includes("Browse categories"));

await browser.close();
console.log("done");
