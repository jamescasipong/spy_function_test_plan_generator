import { createContext, useContext, useState, useEffect } from "react";
import { slug, countCases, download, downloadZip } from "./utils.js";

const GeneratorContext = createContext(null);

let nextUrlId = 1;
const createUrlEntry = (value = "") => ({ id: nextUrlId++, value });

const analyzeUrls = (entries) => {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const urlStatuses = {};
  let duplicateCount = 0;

  for (const entry of entries) {
    const raw = entry.value.trim();
    if (!raw) {
      urlStatuses[entry.id] = { state: "empty" };
      continue;
    }
    try {
      if (/\s/.test(raw)) throw new Error("Invalid URL");
      const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw)
        ? raw
        : `https://${raw}`;
      const u = new URL(candidate);
      if (
        !["http:", "https:"].includes(u.protocol) ||
        !u.hostname ||
        (!u.hostname.includes(".") &&
          u.hostname !== "localhost" &&
          !u.hostname.startsWith("["))
      ) {
        throw new Error("Invalid URL");
      }
      if (seen.has(u.href)) {
        duplicateCount++;
        urlStatuses[entry.id] = { state: "duplicate", href: u.href };
      } else {
        seen.add(u.href);
        valid.push(u.href);
        urlStatuses[entry.id] = { state: "valid", href: u.href };
      }
    } catch {
      invalid.push(raw);
      urlStatuses[entry.id] = { state: "invalid" };
    }
  }

  return { valid, invalid, duplicateCount, urlStatuses };
};

async function callGenerate(body) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new Error(
      data.error ||
        text.slice(0, 200) ||
        `API returned HTTP ${res.status} with no body. Is the API server running on port 3001?`,
    );
  }
  return data;
}

export function GeneratorProvider({ children }) {
  const [urlEntries, setUrlEntries] = useState(() => [
    createUrlEntry("https://dev-ph.speedycourse.com/"),
  ]);
  const [docPrefix, setDocPrefix] = useState("TC-PUB");
  const [notes, setNotes] = useState("");
  const [onExisting, setOnExisting] = useState(
    () => localStorage.getItem("onExisting") || "keep",
  );
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState("raw");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState("none");
  const [viewport, setViewport] = useState("web");
  const [createPage, setCreatePage] = useState(false);
  const [confluenceMode, setConfluenceMode] = useState("folder");
  const [confluenceFolder, setConfluenceFolder] = useState(null);
  const [confluenceTargetPage, setConfluenceTargetPage] = useState(null);
  const [overwriteConfluence, setOverwriteConfluence] = useState(false);
  const [confluenceStatus, setConfluenceStatus] = useState(null);

  useEffect(() => {
    localStorage.setItem("onExisting", onExisting);
  }, [onExisting]);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles || []))
      .catch(() => {});
    fetch("/api/confluence/status")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => setConfluenceStatus(d))
      .catch(() => setConfluenceStatus({ configured: false }));
  }, []);

  const { valid, invalid, duplicateCount, urlStatuses } =
    analyzeUrls(urlEntries);

  const addUrl = (value = "") => {
    const entry = createUrlEntry(value);
    setUrlEntries((prev) => [...prev, entry]);
    return entry.id;
  };

  const updateUrl = (id, value) =>
    setUrlEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, value } : entry)),
    );

  const removeUrl = (id) =>
    setUrlEntries((prev) => {
      if (prev.length <= 1) return [{ ...prev[0], value: "" }];
      return prev.filter((entry) => entry.id !== id);
    });

  const pasteUrls = (id, lines) =>
    setUrlEntries((prev) => {
      const out = [];
      for (const entry of prev) {
        if (entry.id !== id) {
          out.push(entry);
        } else if (entry.value.trim()) {
          out.push(entry);
          for (const extra of lines) out.push(createUrlEntry(extra));
        } else {
          out.push({ ...entry, value: lines[0] });
          for (const extra of lines.slice(1)) out.push(createUrlEntry(extra));
        }
      }
      return out;
    });

  const patch = (i, data) =>
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, ...data } : it)),
    );

  const request = (
    url,
    i,
    itemProfile = profile,
    itemViewport = viewport,
    itemCreatePage = createPage,
    itemConfluence = {
      mode: confluenceMode,
      parentId: confluenceFolder?.id || null,
      targetPageId: confluenceTargetPage?.id || null,
      overwriteConfluence,
    },
  ) =>
    callGenerate({
      url,
      docId: `${docPrefix}-${String(i + 1).padStart(2, "0")}`,
      notes,
      overwrite: onExisting === "overwrite",
      profile: itemProfile,
      viewport: itemViewport,
      createPage: itemCreatePage,
      ...(itemCreatePage &&
      itemConfluence.mode === "page" &&
      itemConfluence.targetPageId
        ? { targetPageId: itemConfluence.targetPageId }
        : {}),
      ...(itemCreatePage &&
      itemConfluence.mode === "folder" &&
      itemConfluence.parentId
        ? { parentId: itemConfluence.parentId }
        : {}),
      ...(itemCreatePage &&
      itemConfluence.mode === "folder" &&
      itemConfluence.overwriteConfluence
        ? { overwriteConfluence: true }
        : {}),
    });

  const toDone = (data, fallbackProfile, fallbackViewport) => ({
    status: "done",
    key: data.key,
    markdown: data.markdown,
    cached: data.cached,
    generatedAt: data.generatedAt,
    hasScreenshot: data.hasScreenshot,
    profile: data.profile ?? fallbackProfile ?? "none",
    viewport: data.viewport ?? fallbackViewport ?? "web",
    confluencePage: data.confluencePage || null,
    confluenceError: data.confluenceError || null,
  });

  async function run(urls = valid) {
    if (!urls.length || busy) return;
    if (
      confluenceStatus?.configured &&
      createPage &&
      confluenceMode === "page" &&
      !confluenceTargetPage?.id
    ) {
      return;
    }
    setBusy(true);
    setSelected(0);
    const runProfile = profile;
    const runViewport = viewport;
    const runCreatePage = createPage;
    const runConfluence = {
      mode: confluenceMode,
      parentId: confluenceFolder?.id || null,
      targetPageId: confluenceTargetPage?.id || null,
      overwriteConfluence,
    };
    setItems(
      urls.map((url) => ({
        url,
        profile: runProfile,
        viewport: runViewport,
        createPage: runCreatePage,
        confluence: runConfluence,
        status: "queued",
      })),
    );
    for (let i = 0; i < urls.length; i++) {
      patch(i, { status: "running" });
      try {
        patch(
          i,
          toDone(
            await request(
              urls[i],
              i,
              runProfile,
              runViewport,
              runCreatePage,
              runConfluence,
            ),
            runProfile,
            runViewport,
          ),
        );
      } catch (e) {
        patch(i, { status: "error", error: e.message });
      }
    }
    setBusy(false);
  }

  function retry(i) {
    if (!items[i]) return;
    setBusy(true);
    patch(i, { status: "running", error: undefined });
    const itemProfile = items[i].profile ?? profile;
    const itemViewport = items[i].viewport ?? viewport;
    const itemCreatePage = items[i].createPage ?? createPage;
    const itemConfluence = items[i].confluence ?? {
      mode: confluenceMode,
      parentId: confluenceFolder?.id || null,
      targetPageId: confluenceTargetPage?.id || null,
      overwriteConfluence,
    };
    request(
      items[i].url,
      i,
      itemProfile,
      itemViewport,
      itemCreatePage,
      itemConfluence,
    )
      .then((data) => patch(i, toDone(data, itemProfile, itemViewport)))
      .catch((e) => patch(i, { status: "error", error: e.message }))
      .finally(() => setBusy(false));
  }

  const current = items[selected];
  const doneItems = items.filter((i) => i.status === "done");

  async function copy() {
    if (!current?.markdown) return;
    await navigator.clipboard.writeText(current.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const finished = items.filter(
    (i) => i.status === "done" || i.status === "error",
  ).length;
  const cachedCount = items.filter((i) => i.cached).length;
  const failedCount = items.filter((i) => i.status === "error").length;
  const pct = items.length ? Math.round((finished / items.length) * 100) : 0;

  const value = {
    urlEntries,
    addUrl,
    updateUrl,
    removeUrl,
    pasteUrls,
    docPrefix,
    setDocPrefix,
    notes,
    setNotes,
    onExisting,
    setOnExisting,
    profiles,
    profile,
    setProfile,
    viewport,
    setViewport,
    createPage,
    setCreatePage,
    confluenceMode,
    setConfluenceMode,
    confluenceFolder,
    setConfluenceFolder,
    confluenceTargetPage,
    setConfluenceTargetPage,
    overwriteConfluence,
    setOverwriteConfluence,
    confluenceStatus,
    items,
    setItems,
    selected,
    setSelected,
    view,
    setView,
    busy,
    copied,
    run,
    retry,
    copy,
    valid,
    invalid,
    duplicateCount,
    urlStatuses,
    current,
    doneItems,
    finished,
    cachedCount,
    failedCount,
    pct,
  };

  return (
    <GeneratorContext.Provider value={value}>
      {children}
    </GeneratorContext.Provider>
  );
}

export function useGenerator() {
  const ctx = useContext(GeneratorContext);
  if (!ctx) throw new Error("useGenerator must be used within GeneratorProvider");
  return ctx;
}
