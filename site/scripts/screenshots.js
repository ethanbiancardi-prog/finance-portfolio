// Regenerates the homepage card thumbnails in public/screenshots/.
//
// Usage (with the dev server running on port 3111, e.g. `npx next dev -p 3111`):
//   npx --package playwright-core node scripts/screenshots.js public/screenshots
//
// Drives the locally installed Chrome (no browser download). Each page is
// loaded, driven far enough to show its real output (a ticker for research,
// a click for Monte Carlo / optimizer), and cropped to the content column
// below the page header so the card shows the tool rather than heading text.
const { chromium } = require("playwright-core");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:3111";
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  { slug: "paper-trading", url: "/paper-trading", wait: async (p) => { await p.waitForFunction(() => /updated \d/i.test(document.body.innerText), null, { timeout: 60000 }); await p.waitForTimeout(4000); } },
  { slug: "rotation", url: "/rotation", wait: async (p) => p.waitForTimeout(6000) },
  {
    slug: "monte-carlo",
    url: "/monte-carlo",
    wait: async (p) => {
      await p.click("button[type=submit]");
      await p.waitForSelector(".recharts-surface", { timeout: 60000 });
      await p.waitForTimeout(1500);
    },
  },
  {
    slug: "optimizer",
    url: "/optimizer",
    wait: async (p) => {
      await p.click("button[type=submit]");
      await p.waitForSelector(".recharts-surface", { timeout: 90000 });
      await p.waitForTimeout(1500);
    },
  },
  { slug: "dcf-builder", url: "/dcf-builder", wait: async (p) => p.waitForSelector(".recharts-surface", { timeout: 30000 }).then(() => p.waitForTimeout(1000)) },
  {
    slug: "research",
    url: "/research",
    wait: async (p) => {
      await p.fill("input[type=text], input:not([type])", "NVDA");
      await p.keyboard.press("Enter");
      await p.waitForFunction(() => document.body.innerText.includes("Gross Margin"), null, { timeout: 60000 });
      await p.keyboard.press("Escape");
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await p.mouse.click(1200, 120);
      await p.waitForFunction(() => /as of/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1000);
    },
  },
  { slug: "quant-notes", url: "/quant-notes", wait: async (p) => p.waitForTimeout(1500) },
  { slug: "backtester", url: "/quant/backtester", wait: async (p) => p.waitForSelector(".recharts-surface", { timeout: 30000 }).then(() => p.waitForTimeout(800)) },
  { slug: "factor-risk", url: "/quant/factor-risk", wait: async (p) => p.waitForTimeout(800) },
  {
    slug: "vol-smile",
    url: "/quant/vol-smile",
    wait: async (p) => {
      await p.waitForSelector(".recharts-surface", { timeout: 30000 });
      const box = await p.locator(".recharts-surface").first().boundingBox();
      await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await p.waitForTimeout(500);
    },
  },
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
  const page = await ctx.newPage();
  for (const { slug, url, wait } of pages.filter((x) => !process.env.ONLY || x.slug === process.env.ONLY)) {
    try {
      await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await wait(page);
      // Crop below the sticky nav so the thumbnail is page content, not chrome.
      // Start just below the page header (title/description) so the card
      // thumbnail shows the tool itself, not a wall of heading text.
      const top = await page.evaluate(() => {
        const header = document.querySelector("main > div");
        return header ? header.getBoundingClientRect().bottom + 8 : 0;
      });
      await page.screenshot({ path: path.join(OUT, `${slug}.png`), clip: { x: 176, y: top, width: 928, height: 464 } });
      console.log("ok", slug);
    } catch (e) {
      console.log("FAIL", slug, e.message.split("\n")[0]);
    }
  }
  await browser.close();
})();
