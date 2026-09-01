import { chromium } from "playwright";

const browser = await chromium.launch();

const lightPage = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: "light" });
await lightPage.goto("http://localhost:3000");
await lightPage.waitForTimeout(500);
await lightPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/bg-light-t0.png", fullPage: false });
await lightPage.waitForTimeout(6000);
await lightPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/bg-light-t6.png", fullPage: false });

const darkPage = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: "dark" });
await darkPage.goto("http://localhost:3000");
await darkPage.waitForTimeout(500);
await darkPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/bg-dark-t0.png", fullPage: false });

await browser.close();
console.log("done");
