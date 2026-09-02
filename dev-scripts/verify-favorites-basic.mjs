import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("http://localhost:3000");
await page.waitForTimeout(1000);

// signed-out: no Favorites link should appear, and normal search should still work
const favLinkVisible = await page.locator('button:has-text("Favorites")').count();
console.log("Favorites link visible while signed out (should be 0):", favLinkVisible);

await page.click('button:has-text("Worldwide")');
await page.fill('input[type="text"]', "makeup");
await page.click('button:has-text("Compare Prices")');
await page.waitForFunction(() => document.body.innerText.includes("Results for"), { timeout: 20000 });
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/favorites-signedout.png", fullPage: true });

console.log("Errors:", JSON.stringify(errors));
await browser.close();
console.log("done");
