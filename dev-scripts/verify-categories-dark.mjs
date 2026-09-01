import { chromium } from "playwright";

const browser = await chromium.launch();

// Light mode, empty state (categories should show)
const lightPage = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: "light" });
await lightPage.goto("http://localhost:3000");
await lightPage.waitForTimeout(1000);
await lightPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/light-categories.png", fullPage: true });

// Dark mode, empty state (background should be colorful, not black)
const darkPage = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: "dark" });
await darkPage.goto("http://localhost:3000");
await darkPage.waitForTimeout(1000);
await darkPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/dark-categories.png", fullPage: true });

// Click a category and confirm it searches
await lightPage.click('button:text("Makeup")');
await lightPage.waitForSelector('a:text("Buy")', { timeout: 15000 });
await lightPage.waitForTimeout(500);
await lightPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/category-search-result.png", fullPage: true });

await browser.close();
console.log("done");
