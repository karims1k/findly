import { chromium } from "playwright";

const browser = await chromium.launch();

const lightPage = await browser.newPage({ viewport: { width: 900, height: 400 }, colorScheme: "light" });
await lightPage.goto("http://localhost:3000");
await lightPage.waitForTimeout(500);
await lightPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/logo-light.png", fullPage: false });

const darkPage = await browser.newPage({ viewport: { width: 900, height: 400 }, colorScheme: "dark" });
await darkPage.goto("http://localhost:3000");
await darkPage.waitForTimeout(500);
await darkPage.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/logo-dark.png", fullPage: false });

await browser.close();
console.log("done");
