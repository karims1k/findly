import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("https://findly-ivory-omega.vercel.app");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/live-bg-final.png", fullPage: false });

await page.click('button:has-text("Worldwide")');
await page.fill('input[type="text"]', "Fenty Beauty Gloss Bomb Universal Lip Luminizer");
await page.click('button:has-text("Compare")');
await page.waitForSelector('a:text("Buy")', { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/live-currency-final.png", fullPage: true });

console.log("Console errors:", JSON.stringify(errors));
await browser.close();
console.log("done");
