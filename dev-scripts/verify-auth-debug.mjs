import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

page.on("response", async (res) => {
  if (res.url().includes("supabase.co") && res.status() >= 400) {
    console.log("URL:", res.url());
    console.log("Status:", res.status());
    try {
      console.log("Body:", await res.text());
    } catch (e) {
      console.log("Could not read body:", e.message);
    }
  }
});

await page.goto("http://localhost:3000");
await page.fill('input[type="email"]', "qa.test.findly@gmail.com");
await page.click('button:text("Sign in")');
await page.waitForTimeout(3000);

await browser.close();
console.log("done");
