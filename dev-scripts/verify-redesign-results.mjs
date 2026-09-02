import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, colorScheme: "light" });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("http://localhost:3000");
await page.click('button:has-text("Worldwide")');
await page.fill('input[type="text"]', "Fenty Beauty Gloss Bomb Universal Lip Luminizer");
await page.click('button:has-text("Compare Prices")');
await page.waitForSelector('a:text("Buy")', { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/redesign-results.png", fullPage: true });

console.log("Console errors:", JSON.stringify(errors));
await browser.close();
console.log("done");
