import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGenerator } from "./GeneratorContext.jsx";
import Screenshot from "./Screenshot.jsx";
import FolderPicker from "./confluence/FolderPicker.jsx";
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

const LABEL = {
  queued: "Queued",
  running: "Generating…",
  done: "Done",
  error: "Failed",
};

export default function Generate() {
  const {
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
  } = useGenerator();

  const urlInputRefs = useRef(new Map());
  const pendingFocusId = useRef(null);

  useEffect(() => {
    if (pendingFocusId.current !== null) {
      const el = urlInputRefs.current.get(pendingFocusId.current);
      if (el) {
        el.focus();
        pendingFocusId.current = null;
      }
    }
  }, [urlEntries]);

  function handleAddUrl() {
    const id = addUrl();
    pendingFocusId.current = id;
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <h1>Test plan generator</h1>
          <p>SpeedyCourse functional QA</p>
        </div>

        <div className="field">
          <span className="label" id="urls-label">
            Page URLs
          </span>
          <div className="url-list" role="group" aria-labelledby="urls-label">
            {urlEntries.map((entry, idx) => {
              const state = urlStatuses[entry.id]?.state;
              return (
                <div key={entry.id} className="url-row">
                  <input
                    ref={(el) => {
                      if (el) urlInputRefs.current.set(entry.id, el);
                      else urlInputRefs.current.delete(entry.id);
                    }}
                    type="url"
                    inputMode="url"
                    aria-label={`Page URL ${idx + 1}`}
                    aria-invalid={state === "invalid" || undefined}
                    className={`url-input${state === "invalid" ? " invalid" : state === "duplicate" ? " duplicate" : ""}`}
                    value={entry.value}
                    onChange={(e) => updateUrl(entry.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddUrl();
                      }
                    }}
                    onPaste={(e) => {
                      const text = e.clipboardData?.getData("text") || "";
                      const lines = text
                        .split(/[\r\n]+/)
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (lines.length > 1) {
                        e.preventDefault();
                        pasteUrls(entry.id, lines);
                      }
                    }}
                    placeholder={
                      idx === 0
                        ? "https://dev-ph.speedycourse.com/"
                        : "https://dev-ph.speedycourse.com/courses"
                    }
                  />
                  <button
                    type="button"
                    className="url-remove-btn"
                    onClick={() => removeUrl(entry.id)}
                    disabled={urlEntries.length === 1 && !entry.value}
                    aria-label={
                      urlEntries.length === 1
                        ? `Clear URL ${idx + 1}`
                        : `Remove URL ${idx + 1}`
                    }
                    title={urlEntries.length === 1 ? "Clear URL" : "Remove URL"}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="add-url-btn"
            onClick={handleAddUrl}
          >
            + Add URL
          </button>
          <small className={invalid.length ? "warn" : ""}>
            {valid.length} valid URL{valid.length === 1 ? "" : "s"}
            {duplicateCount > 0 && `, ${duplicateCount} duplicate`}
            {invalid.length > 0 && `, skipping invalid: ${invalid.join(", ")}`}.
          </small>
        </div>

        <div className="field">
          <label htmlFor="prefix">Document ID prefix</label>
          <input
            id="prefix"
            value={docPrefix}
            onChange={(e) => setDocPrefix(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="notes">Extra context</label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Roles, environment, known behaviors (optional)"
          />
        </div>

        <div className="field">
          <label htmlFor="profile">Sign in as</label>
          <select
            id="profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          >
            <option value="none">Not signed in (public pages)</option>
            {profiles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <small>Create sessions with: npm run auth &lt;name&gt;</small>
        </div>

        <div className="field">
          <span className="label" id="viewport-label">
            Viewport view
          </span>
          <div
            className="segmented"
            role="radiogroup"
            aria-labelledby="viewport-label"
          >
            <button
              type="button"
              role="radio"
              aria-checked={viewport === "web"}
              className={viewport === "web" ? "on" : ""}
              onClick={() => setViewport("web")}
            >
              Web
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewport === "mobile"}
              className={viewport === "mobile" ? "on" : ""}
              onClick={() => setViewport("mobile")}
            >
              Mobile
            </button>
          </div>
          <small>
            {viewport === "mobile"
              ? "Captures mobile responsive layout (390×844) with mobile touch."
              : "Standard desktop web layout (1440×900)."}
          </small>
        </div>

        <div className="field cf-toggle-field">
          <label
            className={`switch-label ${!confluenceStatus?.configured ? "disabled" : ""}`}
            htmlFor="createPage"
          >
            <span className="switch-text">
              Create Confluence page upon generation
            </span>
            <span className="switch-control">
              <input
                id="createPage"
                type="checkbox"
                role="switch"
                aria-checked={createPage}
                className="switch-input"
                checked={createPage}
                onChange={(e) => setCreatePage(e.target.checked)}
                disabled={!confluenceStatus?.configured}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </span>
          </label>
          <small>
            {confluenceStatus === null
              ? "Checking Confluence connection…"
              : confluenceStatus.configured
                ? `Auto-publishes page to Confluence space "${confluenceStatus.space?.name || "Space"}" (${confluenceStatus.space?.key || ""}).`
                : "Confluence is not configured in .env."}
          </small>
          {confluenceStatus?.configured && createPage && (
            <FolderPicker
              space={confluenceStatus.space}
              mode={confluenceMode}
              onModeChange={setConfluenceMode}
              folderValue={confluenceFolder}
              onFolderChange={setConfluenceFolder}
              pageValue={confluenceTargetPage}
              onPageChange={setConfluenceTargetPage}
              overwriteExisting={overwriteConfluence}
              onOverwriteExistingChange={setOverwriteConfluence}
              urlCount={valid.length}
              disabled={busy}
            />
          )}
        </div>

        <div className="field">
          <span className="label" id="existing-label">
            If a saved plan exists
          </span>
          <div
            className="segmented"
            role="radiogroup"
            aria-labelledby="existing-label"
          >
            <button
              role="radio"
              aria-checked={onExisting === "keep"}
              className={onExisting === "keep" ? "on" : ""}
              onClick={() => setOnExisting("keep")}
            >
              Keep it
            </button>
            <button
              role="radio"
              aria-checked={onExisting === "overwrite"}
              className={onExisting === "overwrite" ? "on" : ""}
              onClick={() => setOnExisting("overwrite")}
            >
              Overwrite
            </button>
          </div>
          <small>
            {onExisting === "keep"
              ? "Skips screenshot and AI call for URLs already generated."
              : "Regenerates and replaces the saved plan."}
          </small>
        </div>

        <button
          className="primary"
          disabled={
            busy ||
            !valid.length ||
            Boolean(
              confluenceStatus?.configured &&
                createPage &&
                confluenceMode === "page" &&
                !confluenceTargetPage?.id,
            )
          }
          onClick={() => run()}
        >
          {busy
            ? "Generating…"
            : `Generate ${valid.length || ""} plan${valid.length === 1 ? "" : "s"}`}
        </button>
      </aside>

      <main className="main">
        {items.length > 0 && (
          <section className="queue-wrap">
            <div className="progress-head">
              <strong>
                {finished} of {items.length} finished
              </strong>
              <span>
                {cachedCount > 0 && `${cachedCount} from cache`}
                {cachedCount > 0 && failedCount > 0 && " · "}
                {failedCount > 0 && `${failedCount} failed`}
              </span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${pct}%` }} />
            </div>
            <ul className="queue">
              {items.map((it, i) => (
                <li key={`${it.url}|${it.profile}|${it.viewport}`}>
                  <button
                    className={i === selected ? "active" : ""}
                    onClick={() => setSelected(i)}
                  >
                    <span className={`dot ${it.status}`} aria-hidden="true" />
                    <span className="url">
                      {it.url.replace(/^https?:\/\//, "")}
                    </span>
                    <span className={`auth-badge role-${authTone(it.profile)}`}>
                      {profileLabel(it.profile)}
                    </span>
                    <span className={`viewport-badge role-${it.viewport || "web"}`}>
                      {viewportLabel(it.viewport || "web")}
                    </span>
                    {it.confluencePage && (
                      <span
                        className="cf-published-badge"
                        title={`${it.confluencePage.updated ? "Updated" : "Published"}: ${it.confluencePage.title}`}
                      >
                        {it.confluencePage.updated
                          ? "✓ Updated"
                          : "✓ Confluence"}
                      </span>
                    )}
                    <span className="meta">
                      {it.status === "done"
                        ? `${it.cached ? "Cached · " : ""}${countCases(it.markdown)} cases`
                        : LABEL[it.status]}
                    </span>
                  </button>
                  {it.status === "error" && (
                    <button
                      className="retry"
                      disabled={busy}
                      onClick={() => retry(i)}
                    >
                      Retry
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="output">
          {!current && (
            <div className="empty">
              <h2>No test plans yet</h2>
              <p>
                Add one or more page URLs on the left and select Generate. Each
                page is screenshotted and turned into a Markdown plan you can
                paste into Confluence.
              </p>
            </div>
          )}
          {current?.status === "queued" && (
            <div className="empty">
              <p>Waiting for earlier URLs to finish.</p>
            </div>
          )}
          {current?.status === "running" && (
            <div className="skeleton" aria-live="polite">
              <p>
                Capturing screenshot and writing the plan. This can take a
                minute.
              </p>
              <i />
              <i />
              <i />
              <i style={{ width: "60%" }} />
            </div>
          )}
          {current?.status === "error" && (
            <div className="error-box" role="alert">
              <strong>Generation failed</strong>
              <p>{current.error}</p>
            </div>
          )}
          {current?.status === "done" && (
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
                        title={
                          current.confluencePage.updated
                            ? "View updated page in Confluence"
                            : "View page in Confluence"
                        }
                      >
                        📄 Confluence
                        {current.confluencePage.updated ? " (updated)" : ""}:{" "}
                        {current.confluencePage.title}
                      </Link>
                    )}
                    <span>
                      {countCases(current.markdown)} test cases
                      {current.cached &&
                        ` · saved plan from ${new Date(current.generatedAt).toLocaleString()}`}
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
                {current.key && (
                  <Link
                    className="btn"
                    to={`/confluence/publish?plan=${current.key}`}
                  >
                    Publish to Confluence
                  </Link>
                )}
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
                {doneItems.length > 1 && (
                  <button onClick={() => downloadZip(doneItems)}>
                    Download all (.zip)
                  </button>
                )}
              </div>
              {current.confluenceError && (
                <div className="warn-box" role="status">
                  <strong>Confluence auto-create failed</strong>
                  <p>
                    {current.confluenceError}. Plan saved locally. Use Publish to
                    Confluence to choose another title or folder.
                  </p>
                </div>
              )}
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
      </main>
    </div>
  );
}
