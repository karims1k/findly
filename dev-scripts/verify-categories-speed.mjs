import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("http://localhost:3000");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/more-categories.png", fullPage: true });

// click a "more" category chip
await page.click('button:has-text("Sunscreen")');
await page.waitForFunction(() => document.body.innerText.includes("Results for") || document.body.innerText.includes("Buy"), { timeout: 20000 });
await page.waitForTimeout(300);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/sunscreen-result.png", fullPage: true });

// check localStorage was populated
const geoCache = await page.evaluate(() => localStorage.getItem("findly:geo"));
const ratesCache = await page.evaluate(() => localStorage.getItem("findly:rates"));
console.log("geo cache set:", !!geoCache);
console.log("rates cache set:", !!ratesCache);

console.log("Errors:", JSON.stringify(errors));
await browser.close();
console.log("done");
