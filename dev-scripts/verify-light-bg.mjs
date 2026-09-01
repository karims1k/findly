import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: "light" });
await page.goto("http://localhost:3000");
await page.waitForTimeout(800);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/light-bg-new.png", fullPage: false });
await browser.close();
console.log("done");
