import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConfluence } from "./ConfluenceLayout.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";
import { api, planTitle } from "./api.js";
import { profileLabel, authTone, viewportLabel } from "../utils.js";

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function PublishPlan() {
  const [searchParams] = useSearchParams();
  const urlPlanKey = searchParams.get("plan");
  const urlFolderId = searchParams.get("folder");

  const { space, refreshTree } = useConfluence();

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlanKey, setSelectedPlanKey] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [pageTitle, setPageTitle] = useState("");

  const [destFolder, setDestFolder] = useState(null); // { id, title, path: [] } or null (Space root)
  const [resolvingFolder, setResolvingFolder] = useState(Boolean(urlFolderId));
  const [browseFolderId, setBrowseFolderId] = useState(null); // null = space root
  const [browseFolder, setBrowseFolder] = useState(null); // folder metadata
  const [browseChildren, setBrowseChildren] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishedResult, setPublishedResult] = useState(null); // { id, title, url }

  // Load plans
  useEffect(() => {
    let cancelled = false;
    setLoadingPlans(true);
    api("/api/plans")
      .then((data) => {
        if (cancelled) return;
        const list = data.plans || [];
        setPlans(list);
        if (list.length > 0) {
          const match = urlPlanKey
            ? list.find((p) => p.key === urlPlanKey)
            : list[0];
          const chosen = match || list[0];
          setSelectedPlanKey(chosen.key);
          setPageTitle(planTitle(chosen.url, chosen.profile, chosen.viewport));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlPlanKey]);

  const roles = useMemo(() => {
    const set = new Set();
    for (const p of plans) {
      set.add(p.profile || "none");
    }
    return Array.from(set).sort((a, b) =>
      a === "none" ? -1 : b === "none" ? 1 : a.localeCompare(b),
    );
  }, [plans]);

  const filteredPlans = useMemo(() => {
    if (roleFilter === "all") return plans;
    return plans.filter((p) => (p.profile || "none") === roleFilter);
  }, [plans, roleFilter]);

  function handleRoleFilterChange(newRole) {
    setRoleFilter(newRole);
    const subset =
      newRole === "all"
        ? plans
        : plans.filter((p) => (p.profile || "none") === newRole);
    if (subset.length > 0 && !subset.some((p) => p.key === selectedPlanKey)) {
      const nextPlan = subset[0];
      setSelectedPlanKey(nextPlan.key);
      setPageTitle(planTitle(nextPlan.url, nextPlan.profile, nextPlan.viewport));
      setPublishedResult(null);
    }
  }

  // Browse folder loader
  const loadBrowseFolder = useCallback(
    async (folderId) => {
      setBrowseLoading(true);
      try {
        if (!folderId) {
          // Space root
          setBrowseFolderId(null);
          setBrowseFolder(null);
          const res = await api("/api/confluence/space/children");
          setBrowseChildren(res.children || []);
        } else {
          setBrowseFolderId(folderId);
          const res = await api(`/api/confluence/folders/${folderId}`);
          setBrowseFolder(res.folder);
          setBrowseChildren(res.children || []);
        }
      } catch (err) {
        console.error("Browse folder error:", err);
      } finally {
        setBrowseLoading(false);
      }
    },
    [],
  );

  // Initialize destination from URL if present
  useEffect(() => {
    let cancelled = false;
    if (urlFolderId) {
      setResolvingFolder(true);
      api(`/api/confluence/folders/${urlFolderId}`)
        .then((res) => {
          if (cancelled) return;
          const f = res.folder;
          const homepageId = space?.homepageId ? String(space.homepageId) : null;
          const ancestors = (f.ancestors || [])
            .filter((a) => !homepageId || String(a.id) !== homepageId)
            .map((a) => a.title);
          setDestFolder({
            id: f.id,
            title: f.title,
            path: [...ancestors, f.title],
          });
          loadBrowseFolder(f.id);
        })
        .catch(() => {
          if (!cancelled) loadBrowseFolder(null);
        })
        .finally(() => {
          if (!cancelled) setResolvingFolder(false);
        });
    } else {
      setResolvingFolder(false);
      loadBrowseFolder(null);
    }
    return () => {
      cancelled = true;
    };
  }, [urlFolderId, space, loadBrowseFolder]);

  function handleSelectPlan(key) {
    setSelectedPlanKey(key);
    const chosen = plans.find((p) => p.key === key);
    if (chosen) {
      setPageTitle(planTitle(chosen.url, chosen.profile, chosen.viewport));
    }
    setPublishedResult(null);
  }

  function handleSelectDestination(folder) {
    if (!folder) {
      setDestFolder(null);
    } else {
      const homepageId = space?.homepageId ? String(space.homepageId) : null;
      const ancestors = (folder.ancestors || [])
        .filter((a) => !homepageId || String(a.id) !== homepageId)
        .map((a) => a.title);
      setDestFolder({
        id: folder.id,
        title: folder.title,
        path: [...ancestors, folder.title],
      });
    }
  }

  async function handleCreateFolderHere(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await api("/api/confluence/folders", {
        method: "POST",
        body: {
          title: newFolderName.trim(),
          parentId: browseFolderId || undefined,
        },
      });
      setNewFolderName("");
      setShowNewFolder(false);

      // Select newly created folder as destination
      const curPath = destPathArray();
      setDestFolder({
        id: res.id,
        title: res.title,
        path: [...curPath, res.title],
      });

      // Reload current folder view
      await loadBrowseFolder(browseFolderId);
      await refreshTree(browseFolderId || "root");
    } catch (err) {
      alert(err.message || "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handlePublish(e) {
    e.preventDefault();
    const plan = plans.find((p) => p.key === selectedPlanKey);
    if (!plan) return;
    if (!pageTitle.trim()) {
      alert("Page title is required.");
      return;
    }

    setPublishing(true);
    setPublishError("");
    setPublishedResult(null);

    try {
      const res = await api("/api/confluence/pages", {
        method: "POST",
        body: {
          title: pageTitle.trim(),
          parentId: destFolder ? destFolder.id : undefined,
          markdown: plan.markdown,
        },
      });

      setPublishedResult({
        id: res.id,
        title: res.title,
        url: res.url,
        moved: res.moved,
      });

      // Refresh destination in sidebar tree
      if (destFolder?.id) {
        await refreshTree(destFolder.id, "folder");
      } else {
        await refreshTree("root");
      }
    } catch (err) {
      setPublishError(err.message || "Failed to publish page to Confluence");
    } finally {
      setPublishing(false);
    }
  }

  const selectedPlan = plans.find((p) => p.key === selectedPlanKey);

  function destPathArray() {
    if (!browseFolder) return [];
    const homepageId = space?.homepageId ? String(space.homepageId) : null;
    const ancestors = (browseFolder.ancestors || [])
      .filter((a) => !homepageId || String(a.id) !== homepageId)
      .map((a) => a.title);
    return [...ancestors, browseFolder.title];
  }

  const folderChildren = browseChildren.filter((c) => c.type === "folder");

  return (
    <div className="cf-content-view">
      <Breadcrumbs currentTitle="Publish a plan" />
      <div className="cf-page-head">
        <div className="cf-page-meta">
          <h1>Publish Test Plan to Confluence</h1>
          <p>
            Choose a saved plan and select the destination folder in{" "}
            <strong>{space?.name || "Space"}</strong>.
          </p>
        </div>
      </div>

      {publishedResult && (
        <div className="notice" role="status">
          <strong>Plan successfully published!</strong>
          <p>
            Created page “{publishedResult.title}” (ID {publishedResult.id})
            {publishedResult.moved
              ? " and organized it into your chosen folder."
              : "."}
          </p>
          <div className="actions" style={{ marginTop: "10px" }}>
            <Link
              to={`/confluence/pages/${publishedResult.id}`}
              className="btn solid small"
            >
              View page here
            </Link>
            {publishedResult.url && (
              <a
                href={publishedResult.url}
                target="_blank"
                rel="noreferrer"
                className="btn small"
              >
                Open in Confluence ↗
              </a>
            )}
          </div>
        </div>
      )}

      {publishError && (
        <div className="error-box" role="alert">
          <strong>Publishing failed</strong>
          <p>{publishError}</p>
        </div>
      )}

      <form onSubmit={handlePublish} className="cf-publish-form">
        <div className="card">
          <h2>1. Select Plan & Page Title</h2>

          {loadingPlans && <small>Loading saved plans…</small>}
          {!loadingPlans && plans.length === 0 && (
            <div className="empty">
              <p>No saved plans found. Generate a plan first!</p>
              <Link to="/" className="btn solid small">
                Go to Generator
              </Link>
            </div>
          )}

          {plans.length > 0 && (
            <>
              <div className="field">
                <label htmlFor="planSelect">Saved Test Plan</label>
                {roles.length > 1 && (
                  <div className="role-filters" style={{ marginBottom: "6px" }}>
                    <button
                      type="button"
                      className={`role-filter-btn ${roleFilter === "all" ? "active" : ""}`}
                      onClick={() => handleRoleFilterChange("all")}
                      disabled={publishing}
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
                          onClick={() => handleRoleFilterChange(r)}
                          disabled={publishing}
                        >
                          {profileLabel(r)} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}
                <select
                  id="planSelect"
                  value={selectedPlanKey}
                  onChange={(e) => handleSelectPlan(e.target.value)}
                  disabled={publishing}
                >
                  {filteredPlans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {`[${profileLabel(p.profile)}${p.viewport === "mobile" ? " · Mobile" : ""}] ${p.url.replace(/^https?:\/\//, "")} (${new Date(p.generatedAt).toLocaleDateString()})`}
                    </option>
                  ))}
                </select>
                {selectedPlan && (
                  <div className="cf-selected-plan-meta">
                    <span
                      className={`auth-badge role-${authTone(selectedPlan.profile)}`}
                    >
                      {profileLabel(selectedPlan.profile)}
                    </span>
                    <span
                      className={`viewport-badge role-${selectedPlan.viewport || "web"}`}
                    >
                      {viewportLabel(selectedPlan.viewport || "web")}
                    </span>
                    <span className="context-desc">
                      {selectedPlan.profile &&
                      selectedPlan.profile !== "none" &&
                      selectedPlan.profile !== "unknown"
                        ? `Signed in session: ${selectedPlan.profile}`
                        : selectedPlan.profile === "unknown"
                          ? "Session profile unknown"
                          : "Public unauthenticated capture"}
                    </span>
                    {selectedPlan.confluencePage && (
                      <Link
                        to={`/confluence/pages/${selectedPlan.confluencePage.id}`}
                        className="cf-page-pill"
                        title="Already published in Confluence"
                      >
                        ✓ Published: {selectedPlan.confluencePage.title}
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="pageTitle">Confluence Page Title</label>
                <input
                  id="pageTitle"
                  type="text"
                  value={pageTitle}
                  onChange={(e) => setPageTitle(e.target.value)}
                  placeholder="e.g. Test Plan: Courses Catalog (dev-ph.speedycourse.com)"
                  required
                  disabled={publishing}
                />
              </div>

              <div>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? "Hide Markdown preview" : "Preview plan content"}
                </button>
              </div>

              {showPreview && selectedPlan && (
                <div className="cf-preview-box">
                  <article className="preview">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedPlan.markdown}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="cf-section-head">
            <h2>2. Destination Folder</h2>
            <div className="cf-dest-indicator">
              <span>Target: </span>
              <strong>
                {resolvingFolder
                  ? "Resolving folder…"
                  : destFolder
                    ? `${space?.name || "Space"} / ${destFolder.path.join(" / ")}`
                    : `${space?.name || "Space"} (Root)`}
              </strong>
            </div>
          </div>

          <div className="cf-picker-wrap">
            <div className="cf-picker-nav">
              <span className="cf-picker-nav-label">Browsing:</span>
              <button
                type="button"
                className={`cf-crumb-btn ${browseFolderId === null ? "active" : ""}`}
                onClick={() => loadBrowseFolder(null)}
              >
                {space?.name || "Space Root"}
              </button>

              {browseFolder &&
                (browseFolder.ancestors || [])
                  .filter(
                    (a) =>
                      !space?.homepageId ||
                      String(a.id) !== String(space.homepageId),
                  )
                  .map((a) => (
                    <span key={a.id} className="cf-crumb-span">
                      <span className="cf-sep">/</span>
                      <button
                        type="button"
                        className="cf-crumb-btn"
                        onClick={() => loadBrowseFolder(a.id)}
                      >
                        {a.title}
                      </button>
                    </span>
                  ))}

              {browseFolder && (
                <span className="cf-crumb-span">
                  <span className="cf-sep">/</span>
                  <span className="cf-crumb-cur">{browseFolder.title}</span>
                </span>
              )}
            </div>

            <div className="cf-picker-select-row">
              {browseFolder ? (
                <button
                  type="button"
                  className={`btn small ${destFolder?.id === browseFolder.id ? "solid" : ""}`}
                  onClick={() => handleSelectDestination(browseFolder)}
                >
                  {destFolder?.id === browseFolder.id
                    ? "✓ Destination is set to this folder"
                    : `Use “${browseFolder.title}” as destination`}
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn small ${destFolder === null ? "solid" : ""}`}
                  onClick={() => handleSelectDestination(null)}
                >
                  {destFolder === null
                    ? "✓ Destination is set to Space Root"
                    : "Use Space Root as destination"}
                </button>
              )}

              <button
                type="button"
                className="btn small"
                onClick={() => setShowNewFolder((v) => !v)}
              >
                + Create new folder here
              </button>
            </div>

            {showNewFolder && (
              <div className="cf-picker-new-folder">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name…"
                  autoFocus
                  disabled={creatingFolder}
                />
                <button
                  type="button"
                  className="btn solid small"
                  onClick={handleCreateFolderHere}
                  disabled={creatingFolder || !newFolderName.trim()}
                >
                  {creatingFolder ? "Creating…" : "Create & select"}
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName("");
                  }}
                  disabled={creatingFolder}
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="cf-picker-list">
              {browseLoading && <small>Loading folders…</small>}
              {!browseLoading && folderChildren.length === 0 && (
                <small className="cf-muted">
                  No subfolders here. Click “Use this folder” to publish here, or
                  create a new folder.
                </small>
              )}
              {!browseLoading && folderChildren.length > 0 && (
                <ul className="cf-folder-items">
                  {folderChildren.map((f) => {
                    const isSelected = destFolder?.id === f.id;
                    return (
                      <li key={f.id} className="cf-folder-item">
                        <button
                          type="button"
                          className="cf-folder-drill"
                          onClick={() => loadBrowseFolder(f.id)}
                          title="Open folder"
                        >
                          <FolderIcon />
                          <span>{f.title}</span>
                          <span className="cf-drill-arrow">▸</span>
                        </button>
                        <button
                          type="button"
                          className={`btn small ${isSelected ? "solid" : ""}`}
                          onClick={() =>
                            handleSelectDestination({
                              id: f.id,
                              title: f.title,
                              ancestors: browseFolder
                                ? [
                                    ...(browseFolder.ancestors || []),
                                    {
                                      id: browseFolder.id,
                                      type: "folder",
                                      title: browseFolder.title,
                                    },
                                  ]
                                : [],
                            })
                          }
                        >
                          {isSelected ? "✓ Selected" : "Select"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="primary"
          disabled={publishing || resolvingFolder || !selectedPlan || !pageTitle.trim()}
        >
          {publishing
            ? "Publishing to Confluence…"
            : `Publish to ${destFolder ? `“${destFolder.title}”` : "Space Root"}`}
        </button>
      </form>
    </div>
  );
}
