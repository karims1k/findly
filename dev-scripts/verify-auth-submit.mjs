import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

await page.goto("http://localhost:3000");
await page.fill('input[type="email"]', "qa.test.findly@gmail.com");
await page.click('button:text("Sign in")');
await page.waitForTimeout(3000);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-mac/3dbe48b8-32cf-4e4c-be1c-241fd0fba3e1/scratchpad/auth-submit-result.png", fullPage: true });

console.log("Console errors/page errors:", JSON.stringify(consoleErrors, null, 2));
const bodyText = await page.locator("body").innerText();
console.log("Contains 'Check your email':", bodyText.includes("Check your email"));
console.log("Contains error text:", bodyText.includes("Couldn't send"));

await browser.close();
console.log("done");
