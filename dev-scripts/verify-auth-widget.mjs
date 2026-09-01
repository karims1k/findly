import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto("http://localhost:3000");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/auth-widget-signed-out.png", fullPage: true });

console.log("Console errors:", JSON.stringify(consoleErrors, null, 2));

await browser.close();
console.log("done");
