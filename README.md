# SpeedyCourse Test Plan Generator

React (Vite) UI + Express API. For each URL: Playwright captures a full-page screenshot, Gemini generates the functional test plan, and the UI shows Markdown ready for Confluence.

## Setup
1. `npm install` (also downloads Chromium)
2. `cp .env.example .env` and set `GEMINI_API_KEY`
3. Paste your system instruction into `server/systemPrompt.js`
4. `npm run dev` then open http://localhost:5173

## Structure
- `server/index.js`: `POST /api/generate { url, docId?, notes? }` returns `{ markdown }`
- `src/App.jsx`: multi-URL queue, per-URL status, copy/download

## Jira/Confluence later
Add a route such as `POST /api/publish` that takes the markdown and sends it to the Confluence API; the UI already has the result per URL.
