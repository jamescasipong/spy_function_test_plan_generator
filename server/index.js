import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./systemPrompt.js";
import * as confluence from "./confluence.js";
import {
  normalizeProfile,
  normalizeViewport,
  planTitle,
} from "../shared/planFormat.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

if (!process.env.GEMINI_API_KEY) {
  console.error(
    "Missing GEMINI_API_KEY. Create a .env file in the project root.",
  );
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* ---------- Cache ---------- */

const AUTH_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "auth",
);
const validProfile = (p) => !p || p === "none" || /^[\w-]+$/.test(p); // blocks path traversal

const VIEWPORTS = {
  web: { width: 1440, height: 900, label: "Web", isMobile: false, userAgent: UA },
  mobile: {
    width: 390,
    height: 844,
    label: "Mobile",
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
};

async function listProfiles() {
  const files = await fs.readdir(AUTH_DIR).catch(() => []);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

function inferProfile(key, url, profiles = []) {
  if (!url) return "unknown";
  for (const v of ["web", "mobile"]) {
    if (cacheKey(url, "none", v) === key) return "none";
    for (const p of profiles) {
      if (cacheKey(url, p, v) === key) return p;
    }
  }
  return "unknown";
}

function inferViewport(key, url, profile = "none") {
  if (url && cacheKey(url, profile, "mobile") === key) return "mobile";
  return "web";
}

const CACHE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "cache",
);
await fs.mkdir(CACHE_DIR, { recursive: true });

// SHA-256 of normalized URL + profile + viewport.
// Web viewport keeps the exact previous hash for backward compatibility with existing plans.
const cacheKey = (url, profile, viewport = "web") => {
  const normV = normalizeViewport(viewport);
  const base = profile && profile !== "none" ? `${profile}|${url}` : url;
  const str = normV === "mobile" ? `mobile|${base}` : base;
  return crypto.createHash("sha256").update(str).digest("hex");
};
const mdPath = (key) => path.join(CACHE_DIR, `${key}.md`);
const metaPath = (key) => path.join(CACHE_DIR, `${key}.json`);

async function readCache(key, profiles = []) {
  try {
    const [markdown, metaRaw] = await Promise.all([
      fs.readFile(mdPath(key), "utf-8"),
      fs.readFile(metaPath(key), "utf-8"),
    ]);
    const meta = JSON.parse(metaRaw);
    const profile = meta.profile || inferProfile(key, meta.url, profiles);
    const viewport =
      meta.viewport || inferViewport(key, meta.url, profile);
    return { markdown, ...meta, profile, viewport };
  } catch {
    return null;
  }
}

const pngPath = (key) => path.join(CACHE_DIR, `${key}.png`);
const exists = (p) =>
  fs.access(p).then(
    () => true,
    () => false,
  );

async function writeCache(
  key,
  url,
  markdown,
  png,
  profile,
  viewport = "web",
  confluencePage = null,
) {
  const generatedAt = new Date().toISOString();
  const storedProfile = normalizeProfile(profile);
  const storedViewport = normalizeViewport(viewport);
  await fs.writeFile(mdPath(key), markdown, "utf-8");
  if (png) await fs.writeFile(pngPath(key), png);
  const metaObj = {
    url,
    profile: storedProfile,
    viewport: storedViewport,
    generatedAt,
  };
  if (confluencePage) metaObj.confluencePage = confluencePage;
  await fs.writeFile(metaPath(key), JSON.stringify(metaObj), "utf-8");
  return generatedAt;
}

async function patchCacheMeta(key, patch) {
  const meta = JSON.parse(await fs.readFile(metaPath(key), "utf-8"));
  await fs.writeFile(
    metaPath(key),
    JSON.stringify({ ...meta, ...patch }),
    "utf-8",
  );
}

const isId = (v) => typeof v === "string" && /^\d+$/.test(v);

async function tryAutoPublish({
  url,
  profile,
  viewport,
  markdown,
  parentId,
  targetPageId,
  overwriteConfluence,
}) {
  if (!confluence.isConfigured()) {
    return {
      confluencePage: null,
      confluenceError: "Confluence is not configured in .env.",
    };
  }
  try {
    if (targetPageId) {
      const p = await confluence.updatePage({
        id: targetPageId,
        markdown,
      });
      return {
        confluencePage: {
          id: p.id,
          title: p.title,
          url: p.url,
          updated: true,
        },
        confluenceError: null,
      };
    }

    const title = planTitle(url, profile, viewport);
    if (overwriteConfluence) {
      const existing = await confluence.findPageByTitle(title);
      if (existing) {
        const p = await confluence.updatePage({
          id: existing.id,
          title,
          markdown,
          parentId: parentId || undefined,
        });
        return {
          confluencePage: {
            id: p.id,
            title: p.title,
            url: p.url,
            updated: true,
          },
          confluenceError: null,
        };
      }
    }

    const p = await confluence.createPage({
      title,
      parentId: parentId || undefined,
      markdown,
    });
    return {
      confluencePage: { id: p.id, title: p.title, url: p.url },
      confluenceError: null,
    };
  } catch (cfErr) {
    console.error("[confluence auto-publish]", cfErr.message);
    return {
      confluencePage: null,
      confluenceError: cfErr.message || "Confluence publish failed.",
    };
  }
}

/* ---------- Browser ---------- */

let browserPromise;
const getBrowser = () =>
(browserPromise ??= chromium.launch({
  headless: process.env.HEADLESS !== "false", // set HEADLESS=false in .env to watch it
  channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled"],
}));

async function triggerLazyLoad(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 400);
        total += 400;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 150);
    });
  });
  await page.waitForTimeout(1000);
}

const norm = (u) => {
  const x = new URL(u);
  return x.origin + x.pathname.replace(/\/+$/, "");
};

async function screenshotPage(url, profile, viewport = "web") {
  const browser = await getBrowser();
  const vpConfig = VIEWPORTS[normalizeViewport(viewport)] || VIEWPORTS.web;
  const opts = {
    viewport: { width: vpConfig.width, height: vpConfig.height },
    ...(vpConfig.userAgent ? { userAgent: vpConfig.userAgent } : {}),
    ...(vpConfig.isMobile ? { isMobile: true, hasTouch: true } : {}),
    ...(vpConfig.deviceScaleFactor
      ? { deviceScaleFactor: vpConfig.deviceScaleFactor }
      : {}),
  };
  const authed = profile && profile !== "none";

  if (authed) {
    const file = path.join(AUTH_DIR, `${profile}.json`);
    if (!(await exists(file)))
      throw new Error(
        `No saved session "${profile}". Run: npm run auth ${profile}`,
      );
    opts.storageState = file;
  }

  const context = await browser.newContext(opts);
  try {
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "load", timeout: 45000 });

    if (res && [401, 403].includes(res.status())) {
      if (res.status() === 403 && res.headers()["cf-mitigated"]) {
        throw new Error(
          "Target site blocked the request (HTTP 403 security check).",
        );
      }
      throw new Error(
        `Page returned HTTP ${res.status()}. The session may have expired or lack access.`,
      );
    }

    // Let client-side auth checks and redirects settle before judging the final URL.
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => { });
    await triggerLazyLoad(page);

    if (authed && norm(page.url()) !== norm(url)) {
      throw new Error(
        `Redirected to ${page.url()} instead of ${url}. Session "${profile}" is likely invalid, expired, or blocked. Run: npm run auth ${profile}`,
      );
    }

    return await page.screenshot({ fullPage: true, type: "png" });
  } finally {
    await context.close();
  }
}

/* ---------- Routes ---------- */

// One URL per request so the UI can show per-URL progress.
app.post("/api/generate", async (req, res) => {
  const {
    url,
    docId,
    notes,
    overwrite,
    profile,
    viewport,
    createPage,
    parentId,
    targetPageId,
    overwriteConfluence,
  } = req.body || {};
  try {
    const parsed = new URL(url);

    if (!validProfile(profile)) throw new Error("Invalid profile name.");
    if (createPage && parentId && !isId(parentId))
      throw new Error("Parent ID must be numeric.");
    if (createPage && targetPageId && !isId(targetPageId))
      throw new Error("Target page ID must be numeric.");

    if (!["http:", "https:"].includes(parsed.protocol))
      throw new Error("Only http(s) URLs are supported.");
    parsed.hash = ""; // #fragments point to the same page

    const activeProfile = normalizeProfile(profile);
    const activeViewport = normalizeViewport(viewport);
    const key = cacheKey(parsed.href, activeProfile, activeViewport);

    // Keep existing: return the stored plan without screenshotting or calling Gemini.
    if (!overwrite) {
      const hit = await readCache(key, await listProfiles());
      if (hit) {
        let confluencePage = hit.confluencePage || null;
        let confluenceError = null;
        const shouldPublish =
          createPage &&
          (Boolean(targetPageId) ||
            Boolean(overwriteConfluence) ||
            !confluencePage);
        if (shouldPublish) {
          const pub = await tryAutoPublish({
            url: parsed.href,
            profile: activeProfile,
            viewport: activeViewport,
            markdown: hit.markdown,
            parentId,
            targetPageId,
            overwriteConfluence,
          });
          confluenceError = pub.confluenceError;
          if (pub.confluencePage) {
            confluencePage = pub.confluencePage;
            await patchCacheMeta(key, { confluencePage });
          } else {
            confluencePage = null;
          }
        }
        return res.json({
          url: parsed.href,
          key,
          markdown: hit.markdown,
          cached: true,
          generatedAt: hit.generatedAt,
          hasScreenshot: await exists(pngPath(key)),
          profile: hit.profile,
          viewport: hit.viewport || activeViewport,
          confluencePage,
          ...(confluenceError ? { confluenceError } : {}),
        });
      }
    }

    const shot = await screenshotPage(
      parsed.href,
      activeProfile,
      activeViewport,
    );
    const today = new Date().toISOString().slice(0, 10);

    const viewportGuidance =
      activeViewport === "mobile"
        ? "\nViewport: Mobile view (390×844 responsive mobile viewport). Focus on mobile-specific patterns: hamburger navigation menus, responsive card stacks, touch targets, and collapsible mobile drawers."
        : "\nViewport: Desktop / Web view (1440×900 standard desktop viewport).";

    const userPrompt = `
Analyze the attached visual snapshot of the SpeedyCourse webpage (${parsed.href}).
Identify all visible navigation bars, search inputs, dropdown filters, category buttons, featured cards, and footers.
Create an exhaustive, ready-to-execute Functional Test Plan adhering strictly to the system instructions.
Current date: ${today}.${viewportGuidance}${activeProfile !== "none" ? `\nAuthenticated User Role: ${activeProfile}` : "\nAuthenticated User Role: Public (not signed in)"}${docId ? `\nDocument ID: ${docId}` : ""}${notes ? `\nAdditional context from the user: ${notes}` : ""}`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          inlineData: { data: shot.toString("base64"), mimeType: "image/png" },
        },
        { text: userPrompt },
      ],
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 1.0 },
    });

    if (!response.text) throw new Error("Empty response from Gemini API.");

    let confluencePage = null;
    let confluenceError = null;
    if (createPage) {
      ({ confluencePage, confluenceError } = await tryAutoPublish({
        url: parsed.href,
        profile: activeProfile,
        viewport: activeViewport,
        markdown: response.text,
        parentId,
        targetPageId,
        overwriteConfluence,
      }));
    }

    const generatedAt = await writeCache(
      key,
      parsed.href,
      response.text,
      shot,
      activeProfile,
      activeViewport,
      confluencePage,
    );

    res.json({
      url: parsed.href,
      key,
      markdown: response.text,
      cached: false,
      generatedAt,
      hasScreenshot: true,
      profile: activeProfile,
      viewport: activeViewport,
      confluencePage,
      ...(confluenceError ? { confluenceError } : {}),
    });
  } catch (err) {
    console.error(`[${url}]`, err.message || err);
    res.status(500).json({ error: err.message || "Generation failed." });
  }
});

app.get("/api/profiles", async (_req, res) => {
  res.json({ profiles: await listProfiles() });
});

// List every saved plan, newest first.
app.get("/api/plans", async (_req, res) => {
  try {
    const profiles = await listProfiles();
    const files = await fs.readdir(CACHE_DIR);
    const keys = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
    const plans = (
      await Promise.all(
        keys.map(async (key) => {
          const hit = await readCache(key, profiles);
          return (
            hit && {
              key,
              url: hit.url,
              profile: hit.profile,
              viewport: hit.viewport || "web",
              confluencePage: hit.confluencePage || null,
              generatedAt: hit.generatedAt,
              markdown: hit.markdown,
              hasScreenshot: await exists(pngPath(key)),
            }
          );
        }),
      )
    ).filter(Boolean);
    plans.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

    res.json({ plans });
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || "Could not read saved plans." });
  }
});

app.get("/api/plans/:key/screenshot", async (req, res) => {
  const { key } = req.params;
  if (!/^[a-f0-9]{64}$/.test(key))
    return res.status(400).json({ error: "Invalid plan key." });
  if (!(await exists(pngPath(key))))
    return res
      .status(404)
      .json({ error: "No screenshot saved for this plan." });
  res.sendFile(pngPath(key));
});

// Delete one saved plan.
app.delete("/api/plans/:key", async (req, res) => {
  const { key } = req.params;
  if (!/^[a-f0-9]{64}$/.test(key))
    return res.status(400).json({ error: "Invalid plan key." });
  try {
    await Promise.all([
      fs.rm(mdPath(key), { force: true }),
      fs.rm(metaPath(key), { force: true }),
      fs.rm(pngPath(key), { force: true }),
    ]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Delete failed." });
  }
});

/* ---------- Confluence ---------- */

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    console.error("[confluence]", e.message);
    res.status(500).json({ error: e.message || "Confluence request failed." });
  }
};

app.get(
  "/api/confluence/status",
  wrap(async () => {
    if (!confluence.isConfigured()) return { configured: false };
    const space = await confluence.getSpace();
    return { configured: true, space };
  }),
);

app.get(
  "/api/confluence/space/children",
  wrap(async () => {
    return { children: await confluence.listSpaceRootContent() };
  }),
);

app.get(
  "/api/confluence/search",
  wrap(async (req) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    return {
      results: q.trim() ? await confluence.searchContent(q.trim()) : [],
    };
  }),
);

app.get(
  "/api/confluence/folders/:id",
  wrap(async (req) => {
    if (!isId(req.params.id)) throw new Error("Folder ID must be numeric.");
    const [folder, children] = await Promise.all([
      confluence.getFolder(req.params.id),
      confluence.listFolderChildren(req.params.id),
    ]);
    return { folder, children };
  }),
);

app.post(
  "/api/confluence/folders",
  wrap(async (req) => {
    const { title, parentId } = req.body || {};
    if (parentId && !isId(parentId))
      throw new Error("Parent ID must be numeric.");
    return confluence.createFolder({ title, parentId });
  }),
);

app.get(
  "/api/confluence/pages/:id",
  wrap(async (req) => {
    if (!isId(req.params.id)) throw new Error("Page ID must be numeric.");
    return confluence.getPage(req.params.id);
  }),
);

app.get(
  "/api/confluence/pages/:id/children",
  wrap(async (req) => {
    if (!isId(req.params.id)) throw new Error("Page ID must be numeric.");
    return { children: await confluence.listPageChildren(req.params.id) };
  }),
);

app.post(
  "/api/confluence/pages",
  wrap(async (req) => {
    const { title, parentId, markdown } = req.body || {};
    if (parentId && !isId(parentId))
      throw new Error("Parent ID must be numeric.");
    return confluence.createPage({ title, parentId, markdown });
  }),
);

app.put(
  "/api/confluence/pages/:id",
  wrap(async (req) => {
    if (!isId(req.params.id)) throw new Error("Page ID must be numeric.");
    const { title, parentId, markdown } = req.body || {};
    if (parentId && !isId(parentId))
      throw new Error("Parent ID must be numeric.");
    return confluence.updatePage({
      id: req.params.id,
      title,
      parentId,
      markdown,
    });
  }),
);

/* ---------- Startup / shutdown ---------- */

process.on("unhandledRejection", (e) =>
  console.error("Unhandled rejection:", e),
);
process.on("uncaughtException", (e) => console.error("Uncaught exception:", e));

const port = process.env.PORT || 3001;
app.listen(port, () =>
  console.log(`API listening on http://localhost:${port}`),
);

process.on("SIGINT", async () => {
  if (browserPromise) await (await browserPromise).close();
  process.exit();
});
