import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3000");
const iconLinks = await page.locator('link[rel*="icon"]').evaluateAll((els) =>
  els.map((e) => ({ rel: e.getAttribute("rel"), href: e.getAttribute("href"), type: e.getAttribute("type") }))
);
console.log(JSON.stringify(iconLinks, null, 2));
await browser.close();
