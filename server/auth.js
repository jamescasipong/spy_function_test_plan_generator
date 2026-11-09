import "dotenv/config";
import { chromium } from "playwright";
import readline from "node:readline/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "auth");
const profile = process.argv[2] || "default";
if (!/^[\w-]+$/.test(profile))
  throw new Error("Profile name: letters, numbers, - and _ only.");
const loginUrl =
  process.argv[3] ||
  process.env.LOGIN_URL ||
  "https://dev-ph.speedycourse.com/account/login/";

await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  channel: "chrome", // your installed Google Chrome, not bundled Chromium
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled"],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.goto(loginUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
await rl.question(
  `Log in as "${profile}" in the browser window, then press Enter here to save... `,
);
rl.close();

await context.storageState({ path: path.join(dir, `${profile}.json`) });
await browser.close();
console.log(`Saved server/auth/${profile}.json`);
