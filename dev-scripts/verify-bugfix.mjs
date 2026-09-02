import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("http://localhost:3000");
await page.click('button:has-text("Worldwide")');
await page.fill('input[type="text"]', "lip gloss");
await page.click('button:has-text("Compare")');
await page.waitForFunction(() => document.body.innerText.includes("Results for"), { timeout: 20000 });

// Find and click the HAUS LABS card specifically (the one that was failing)
const hausCard = page.locator('main button:has-text("HAUS LABS")');
const hasHaus = await hausCard.count();
console.log("HAUS LABS card present in this grid:", hasHaus > 0);

if (hasHaus > 0) {
  await hausCard.first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/bugfix-haus.png", fullPage: true });
  const bodyText = await page.locator("body").innerText();
  console.log("Shows 'Browse categories' alongside content:", bodyText.includes("Browse categories"));
  console.log("Body snippet:", bodyText.slice(0, 400));
} else {
  console.log("Grid contents this run:", await page.locator("main .line-clamp-2").allInnerTexts());
}

console.log("Errors:", JSON.stringify(errors));
await browser.close();
console.log("done");
