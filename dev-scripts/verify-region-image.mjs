import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on("console", (msg) => console.log("[console]", msg.text()));

await page.goto("http://localhost:3000");
await page.waitForFunction(
  () => document.querySelector("p.px-1")?.textContent?.trim().length > 0,
  { timeout: 8000 }
).catch(() => console.log("geo caption never populated"));
await page.waitForTimeout(1000);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/region-local.png", fullPage: true });

const captionText = await page.locator("p.px-1").first().textContent();
console.log("LOCAL CAPTION:", captionText);

await page.fill('input[type="text"]', "Fenty Beauty Gloss Bomb Universal Lip Luminizer");
await page.click('button[type="submit"]');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/region-local-results.png", fullPage: true });

const imgSrcs = await page.locator("main img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src")));
console.log("IMAGE SRCS:", JSON.stringify(imgSrcs));

// switch to worldwide
await page.click('button:text("Worldwide")');
await page.click('button[type="submit"]');
await page.waitForSelector('a:text("Buy")', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/region-worldwide-results.png", fullPage: true });

await browser.close();
console.log("done");
