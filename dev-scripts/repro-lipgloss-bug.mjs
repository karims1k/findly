import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on("request", (req) => { if (req.url().includes("/api/compare")) console.log(">>", req.url()); });
page.on("response", async (res) => {
  if (res.url().includes("/api/compare")) {
    console.log("<<", res.status(), res.url());
  }
});
page.on("console", (msg) => { if (msg.type() === "error") console.log("[console error]", msg.text()); });
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto("http://localhost:3000");
await page.click('button:has-text("Worldwide")');
await page.fill('input[type="text"]', "lip gloss");
await page.click('button:has-text("Compare")');
await page.waitForFunction(() => document.body.innerText.includes("Results for"), { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/repro-step1-grid.png", fullPage: true });

// list the product card titles
const titles = await page.locator("main .line-clamp-2").allInnerTexts();
console.log("Grid product titles:", JSON.stringify(titles, null, 2));

// click the first product card
const cards = page.locator('main button:has(img), main button:has(div.aspect-square)');
console.log("Card count:", await cards.count());
await cards.first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/repro-step2-afterclick.png", fullPage: true });

const bodyText = await page.locator("body").innerText();
console.log("Body after click:", bodyText.slice(0, 600));

await browser.close();
console.log("done");
