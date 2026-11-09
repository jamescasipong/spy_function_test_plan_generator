import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useConfluence } from "./ConfluenceLayout.jsx";
import { api, handleArticleClick } from "./api.js";

function FolderIcon() {
  return (
    <svg
      width="18"
      height="18"
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

function PageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export default function SpaceRoot() {
  const navigate = useNavigate();
  const { space, childrenByParent, refreshTree } = useConfluence();
  const rootItems = childrenByParent["root"] || [];

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [showOverview, setShowOverview] = useState(true);

  useEffect(() => {
    if (!space?.homepageId) return;
    let cancelled = false;
    setLoadingOverview(true);
    api(`/api/confluence/pages/${space.homepageId}`)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingOverview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [space?.homepageId]);

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api("/api/confluence/folders", {
        method: "POST",
        body: { title: newTitle.trim() },
      });
      setNewTitle("");
      setShowNewFolder(false);
      await refreshTree("root");
    } catch (err) {
      alert(err.message || "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="cf-content-view">
      <div className="cf-page-head">
        <div className="cf-page-meta">
          <span className="cf-space-badge large">{space?.key || "SD"}</span>
          <div>
            <h1>{space?.name || "Confluence Space"}</h1>
            <p>
              {rootItems.length} root item{rootItems.length === 1 ? "" : "s"} in
              this space
            </p>
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => setShowNewFolder((v) => !v)}
          >
            + New folder
          </button>
          <Link to="/confluence/publish" className="btn solid">
            Publish a plan
          </Link>
          {space?.url && (
            <a
              href={space.url}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Open in Confluence ↗
            </a>
          )}
        </div>
      </div>

      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="cf-folder-creator card">
          <strong>Create new root folder</strong>
          <div className="row">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Functional Test Plans"
              autoFocus
              disabled={creating}
            />
            <button
              type="submit"
              className="btn solid"
              disabled={creating || !newTitle.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowNewFolder(false);
                setNewTitle("");
              }}
              disabled={creating}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="cf-section card">
        <div className="cf-section-head">
          <h2>Root Directory</h2>
          <small>{rootItems.length} items</small>
        </div>

        {rootItems.length === 0 ? (
          <div className="empty">
            <p>No content in this space root yet.</p>
          </div>
        ) : (
          <div className="cf-dir">
            {rootItems.map((item) => {
              const isFolder = item.type === "folder";
              const to = isFolder
                ? `/confluence/folders/${item.id}`
                : `/confluence/pages/${item.id}`;
              return (
                <div key={item.id} className="cf-dir-row">
                  <span className="cf-dir-icon">
                    {isFolder ? <FolderIcon /> : <PageIcon />}
                  </span>
                  <Link to={to} className="cf-dir-title">
                    {item.title}
                  </Link>
                  <span className="cf-badge">{item.type}</span>
                  <div className="cf-dir-actions">
                    {isFolder && (
                      <Link
                        to={`/confluence/publish?folder=${item.id}`}
                        className="btn small"
                      >
                        Publish here
                      </Link>
                    )}
                    <Link to={to} className="btn small">
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {space?.homepageId && (
        <section className="cf-section card">
          <div className="cf-section-head">
            <h2>Space Overview</h2>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowOverview((v) => !v)}
            >
              {showOverview ? "Hide overview" : "Show overview"}
            </button>
          </div>

          {showOverview && (
            <>
              {loadingOverview && <small>Loading space overview…</small>}
              {!loadingOverview && overview?.body && (
                <article
                  className="cf-article"
                  onClick={(e) => handleArticleClick(e, space?.key, navigate)}
                  dangerouslySetInnerHTML={{ __html: overview.body }}
                />
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
