import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("http://localhost:3000");
await page.click('button:text("Worldwide")');
await page.setInputFiles('input[type="file"]', "/tmp/lens-test.jpg");
await page.waitForFunction(() => document.body.innerText.includes("Results for"), { timeout: 25000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/photo-similar-grid.png", fullPage: true });

console.log("Console errors:", JSON.stringify(errors));

// drill into a card
const cards = page.locator('main button:has(img), main button:has(div.aspect-square)');
console.log("Card count:", await cards.count());
await cards.nth(1).click();
await page.waitForFunction(() => document.body.innerText.includes("Buy") || document.body.innerText.includes("Results for"), { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/photo-similar-drilldown.png", fullPage: true });

await browser.close();
console.log("done");
