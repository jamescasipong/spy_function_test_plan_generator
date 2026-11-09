import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Screenshot from "./Screenshot.jsx";
import {
  slug,
  countCases,
  download,
  downloadZip,
  profileLabel,
  authTone,
  planFilename,
  viewportLabel,
} from "./utils.js";

export default function SavedPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [viewportFilter, setViewportFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState(null);
  const [view, setView] = useState("raw");
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plans");
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok)
        throw new Error(
          data.error || `HTTP ${res.status}. Is the API server running?`,
        );
      setPlans(data.plans);
      setSelectedKey((k) =>
        data.plans.some((p) => p.key === k) ? k : (data.plans[0]?.key ?? null),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const roles = useMemo(() => {
    const set = new Set();
    for (const p of plans) {
      set.add(p.profile || "none");
    }
    return Array.from(set).sort((a, b) =>
      a === "none" ? -1 : b === "none" ? 1 : a.localeCompare(b),
    );
  }, [plans]);

  const viewports = useMemo(() => {
    const set = new Set();
    for (const p of plans) {
      set.add(p.viewport || "web");
    }
    return ["web", "mobile"].filter((v) => set.has(v));
  }, [plans]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      const pRole = p.profile || "none";
      const pViewport = p.viewport || "web";
      if (roleFilter !== "all" && pRole !== roleFilter) return false;
      if (viewportFilter !== "all" && pViewport !== viewportFilter)
        return false;
      if (!q) return true;
      const urlMatch = p.url.toLowerCase().includes(q);
      const roleMatch = profileLabel(p.profile).toLowerCase().includes(q);
      const viewportMatch = viewportLabel(pViewport).toLowerCase().includes(q);
      return urlMatch || roleMatch || viewportMatch;
    });
  }, [plans, query, roleFilter, viewportFilter]);

  const current = plans.find((p) => p.key === selectedKey);

  async function remove(plan) {
    if (!window.confirm(`Delete the saved plan for ${plan.url}?`)) return;
    try {
      const res = await fetch(`/api/plans/${plan.key}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (HTTP ${res.status}).`);
      setPlans((prev) => prev.filter((p) => p.key !== plan.key));
      if (selectedKey === plan.key) setSelectedKey(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(current.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="saved">
      <section className="saved-list">
        <div className="saved-head">
          <strong>
            {plans.length} saved plan{plans.length === 1 ? "" : "s"}
          </strong>
          <div className="actions">
            <button onClick={load} disabled={loading}>
              Refresh
            </button>
            <button
              disabled={!filtered.length}
              onClick={() => downloadZip(filtered)}
            >
              Download{" "}
              {query || roleFilter !== "all" || viewportFilter !== "all"
                ? "filtered"
                : "all"}{" "}
              (.zip)
            </button>
          </div>
        </div>
        <input
          type="search"
          aria-label="Search by URL, auth role, or viewport"
          placeholder="Search by URL, auth role, or viewport"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {roles.length > 1 && (
          <div className="role-filters">
            <button
              type="button"
              className={`role-filter-btn ${roleFilter === "all" ? "active" : ""}`}
              onClick={() => setRoleFilter("all")}
            >
              All ({plans.length})
            </button>
            {roles.map((r) => {
              const count = plans.filter(
                (p) => (p.profile || "none") === r,
              ).length;
              return (
                <button
                  key={r}
                  type="button"
                  className={`role-filter-btn ${roleFilter === r ? "active" : ""}`}
                  onClick={() => setRoleFilter(r)}
                >
                  {profileLabel(r)} ({count})
                </button>
              );
            })}
          </div>
        )}
        {viewports.length > 1 && (
          <div className="role-filters viewport-filters">
            <button
              type="button"
              className={`viewport-filter-btn ${viewportFilter === "all" ? "active" : ""}`}
              onClick={() => setViewportFilter("all")}
            >
              All viewports ({plans.length})
            </button>
            {viewports.map((v) => {
              const count = plans.filter(
                (p) => (p.viewport || "web") === v,
              ).length;
              return (
                <button
                  key={v}
                  type="button"
                  className={`viewport-filter-btn ${viewportFilter === v ? "active" : ""}`}
                  onClick={() => setViewportFilter(v)}
                >
                  {viewportLabel(v)} ({count})
                </button>
              );
            })}
          </div>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {loading && <small>Loading saved plans…</small>}
        {!loading && !error && plans.length === 0 && (
          <small>
            Nothing saved yet. Plans appear here after you generate them.
          </small>
        )}
        {!loading && plans.length > 0 && filtered.length === 0 && (
          <small>
            {query
              ? `No plans match “${query}”.`
              : "No plans match the selected filter."}
          </small>
        )}
        <ul className="queue">
          {filtered.map((p) => (
            <li key={p.key}>
              <button
                className={p.key === selectedKey ? "active" : ""}
                onClick={() => setSelectedKey(p.key)}
              >
                <span className="url">{p.url.replace(/^https?:\/\//, "")}</span>
                <div className="meta-row">
                  <span className={`auth-badge role-${authTone(p.profile)}`}>
                    {profileLabel(p.profile)}
                  </span>
                  <span className={`viewport-badge role-${p.viewport || "web"}`}>
                    {viewportLabel(p.viewport || "web")}
                  </span>
                  {p.confluencePage && (
                    <span
                      className="cf-published-badge"
                      title={`Published: ${p.confluencePage.title}`}
                    >
                      ✓ Confluence
                    </span>
                  )}
                  <span className="meta">
                    {countCases(p.markdown)} cases ·{" "}
                    {new Date(p.generatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="output">
        {!current && (
          <div className="empty">
            <h2>Select a plan</h2>
            <p>Pick a saved plan from the list to read, copy or download it.</p>
          </div>
        )}
        {current && (
          <>
            <div className="toolbar">
              <div className="title">
                <span className="url">{current.url}</span>
                <small className="meta-row">
                  <span
                    className={`auth-badge role-${authTone(current.profile)}`}
                  >
                    {profileLabel(current.profile)}
                  </span>
                  <span
                    className={`viewport-badge role-${current.viewport || "web"}`}
                  >
                    {viewportLabel(current.viewport || "web")}
                  </span>
                  {current.confluencePage && (
                    <Link
                      to={`/confluence/pages/${current.confluencePage.id}`}
                      className="cf-page-pill"
                      title="View page in Confluence"
                    >
                      📄 Confluence: {current.confluencePage.title}
                    </Link>
                  )}
                  <span>
                    {countCases(current.markdown)} test cases · generated{" "}
                    {new Date(current.generatedAt).toLocaleString()}
                  </span>
                </small>
              </div>
              <div className="tabs">
                <button
                  className={view === "raw" ? "on" : ""}
                  onClick={() => setView("raw")}
                >
                  Markdown
                </button>
                <button
                  className={view === "preview" ? "on" : ""}
                  onClick={() => setView("preview")}
                >
                  Preview
                </button>
                <button
                  className={view === "shot" ? "on" : ""}
                  onClick={() => setView("shot")}
                >
                  Screenshot
                </button>
              </div>
            </div>
            <div className="actions">
              <Link
                className="btn"
                to={`/confluence/publish?plan=${current.key}`}
              >
                Publish to Confluence
              </Link>
              <button className="solid" onClick={copy}>
                {copied ? "Copied" : "Copy for Confluence"}
              </button>
              <button
                onClick={() =>
                  download(
                    planFilename(
                      current.url,
                      current.profile,
                      "md",
                      current.viewport,
                    ),
                    current.markdown,
                  )
                }
              >
                Download .md
              </button>
              <button className="danger" onClick={() => remove(current)}>
                Delete
              </button>
            </div>
            {view === "raw" ? (
              <textarea className="raw" readOnly value={current.markdown} />
            ) : view === "preview" ? (
              <article className="preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {current.markdown}
                </ReactMarkdown>
              </article>
            ) : (
              <Screenshot plan={current} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
