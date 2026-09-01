import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
page.on("request", (req) => { if (req.url().includes("/api/")) console.log(">>", req.method(), req.url()); });
page.on("response", (res) => { if (res.url().includes("/api/")) console.log("<<", res.status(), res.url()); });

await page.goto("http://localhost:3000");
await page.waitForTimeout(1500);

await page.click('button:has-text("Worldwide")');
await page.waitForTimeout(200);
await page.fill('input[type="text"]', "Fenty Beauty Gloss Bomb Universal Lip Luminizer");
await page.waitForTimeout(200);
const inputVal = await page.inputValue('input[type="text"]');
console.log("Input value before submit:", inputVal);
await page.click('button:has-text("Compare")');
await page.waitForTimeout(5000);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/currency-worldwide.png", fullPage: true });
console.log("Errors:", JSON.stringify(errors, null, 2));

await browser.close();
console.log("done");
