import { chromium } from "playwright";

const APP_BASE = process.env.APP_BASE || "http://localhost:3000";
const OUT_DIR = process.argv[2] || ".";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${APP_BASE}/campaign/screenshot-goalzero`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT_DIR}/goal-zero.png` });

await page.goto(`${APP_BASE}/campaign/screenshot-overfunded`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT_DIR}/goal-overfunded.png` });

await browser.close();
console.log("done");
