import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useConfluence } from "./ConfluenceLayout.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";
import { api } from "./api.js";

function FolderIcon() {
  return (
    <svg
      width="20"
      height="20"
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

export default function FolderView() {
  const { folderId } = useParams();
  const { revealPath, refreshTree, setChildrenByParent } = useConfluence();

  const [folder, setFolder] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewSubfolder, setShowNewSubfolder] = useState(false);
  const [subfolderTitle, setSubfolderTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setShowNewSubfolder(false);
    setSubfolderTitle("");

    api(`/api/confluence/folders/${folderId}`)
      .then((data) => {
        if (cancelled) return;
        setFolder(data.folder);
        setChildren(data.children || []);
        setChildrenByParent((prev) => ({
          ...prev,
          [folderId]: data.children || [],
        }));
        if (data.folder?.ancestors) {
          revealPath(data.folder.ancestors);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folderId, revealPath, setChildrenByParent]);

  async function handleCreateSubfolder(e) {
    e.preventDefault();
    if (!subfolderTitle.trim()) return;
    setCreating(true);
    try {
      await api("/api/confluence/folders", {
        method: "POST",
        body: { title: subfolderTitle.trim(), parentId: folderId },
      });
      setSubfolderTitle("");
      setShowNewSubfolder(false);
      const updated = await api(`/api/confluence/folders/${folderId}`);
      setChildren(updated.children || []);
      setChildrenByParent((prev) => ({
        ...prev,
        [folderId]: updated.children || [],
      }));
      await refreshTree(folderId, "folder");
    } catch (err) {
      alert(err.message || "Failed to create subfolder");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="output">
        <small>Loading folder…</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-box" role="alert">
        <strong>Error loading folder</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!folder) return null;

  return (
    <div className="cf-content-view">
      <Breadcrumbs ancestors={folder.ancestors} currentTitle={folder.title} />

      <div className="cf-page-head">
        <div className="cf-page-meta">
          <span className="cf-folder-avatar">
            <FolderIcon />
          </span>
          <div>
            <h1>{folder.title}</h1>
            <p>
              Folder · {children.length} item{children.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => setShowNewSubfolder((v) => !v)}
          >
            + New subfolder
          </button>
          <Link
            to={`/confluence/publish?folder=${folderId}`}
            className="btn solid"
          >
            Publish plan here
          </Link>
          {folder.url && (
            <a
              href={folder.url}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Open in Confluence ↗
            </a>
          )}
        </div>
      </div>

      {showNewSubfolder && (
        <form onSubmit={handleCreateSubfolder} className="cf-folder-creator card">
          <strong>Create new subfolder inside “{folder.title}”</strong>
          <div className="row">
            <input
              type="text"
              value={subfolderTitle}
              onChange={(e) => setSubfolderTitle(e.target.value)}
              placeholder="e.g. Sprint 24 Regression"
              autoFocus
              disabled={creating}
            />
            <button
              type="submit"
              className="btn solid"
              disabled={creating || !subfolderTitle.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowNewSubfolder(false);
                setSubfolderTitle("");
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
          <h2>Contents</h2>
          <small>{children.length} items</small>
        </div>

        {children.length === 0 ? (
          <div className="empty">
            <h2>Folder is empty</h2>
            <p>
              Publish a test plan directly here or create a subfolder using the
              buttons above.
            </p>
          </div>
        ) : (
          <div className="cf-dir">
            {children.map((item) => {
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
    </div>
  );
}
