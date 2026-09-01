import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto("https://findly-ivory-omega.vercel.app");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/live-final.png", fullPage: true });

console.log("Console/page errors:", JSON.stringify(errors, null, 2));

const iconLinks = await page.locator('link[rel*="icon"]').evaluateAll((els) =>
  els.map((e) => ({ rel: e.getAttribute("rel"), href: e.getAttribute("href") }))
);
console.log("Icon links:", JSON.stringify(iconLinks));

await browser.close();
console.log("done");
