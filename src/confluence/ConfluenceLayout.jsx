import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "./api.js";

const ConfluenceContext = createContext(null);
export const useConfluence = () => useContext(ConfluenceContext);

function FolderIcon() {
  return (
    <svg
      width="15"
      height="15"
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
      width="15"
      height="15"
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

function TreeList({ items = [], level = 0 }) {
  const {
    childrenByParent,
    expanded,
    loadingNode,
    toggleNode,
  } = useConfluence();

  if (!items.length) return null;

  return (
    <ul className="cf-tree" style={{ "--level": level }}>
      {items.map((node) => {
        const isFolder = node.type === "folder";
        const isExpanded = Boolean(expanded[node.id]);
        const isLoading = Boolean(loadingNode[node.id]);
        const children = childrenByParent[node.id];
        const canExpand = isFolder || (children && children.length > 0);
        const to = isFolder
          ? `/confluence/folders/${node.id}`
          : `/confluence/pages/${node.id}`;

        return (
          <li key={node.id} className="cf-tree-item">
            <div
              className="cf-tree-row"
              style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
              {canExpand ? (
                <button
                  type="button"
                  className="cf-tree-toggle"
                  onClick={() => toggleNode(node)}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
              ) : (
                <span className="cf-tree-spacer" aria-hidden="true" />
              )}

              <NavLink
                to={to}
                className={({ isActive }) =>
                  `cf-tree-link ${isActive ? "active" : ""}`
                }
              >
                <span className="cf-tree-icon">
                  {isFolder ? <FolderIcon /> : <PageIcon />}
                </span>
                <span className="cf-tree-title">{node.title}</span>
              </NavLink>

              {isFolder && (
                <Link
                  to={`/confluence/publish?folder=${node.id}`}
                  className="cf-tree-add"
                  title="Publish plan in this folder"
                  aria-label={`Publish plan in ${node.title}`}
                >
                  +
                </Link>
              )}
            </div>

            {isExpanded && (
              <div className="cf-tree-children">
                {isLoading && (
                  <div
                    className="cf-tree-loading"
                    style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                  >
                    Loading…
                  </div>
                )}
                {!isLoading && children && children.length === 0 && (
                  <div
                    className="cf-tree-empty"
                    style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                  >
                    Empty
                  </div>
                )}
                {!isLoading && children && children.length > 0 && (
                  <TreeList items={children} level={level + 1} />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ConfluenceLayout() {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [childrenByParent, setChildrenByParent] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loadingNode, setLoadingNode] = useState({});
  const [treeError, setTreeError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const childrenRef = useRef(childrenByParent);
  childrenRef.current = childrenByParent;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const inflightRef = useRef(new Map());

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await api("/api/confluence/status");
      setStatus(s);
    } catch (e) {
      setStatus({ configured: false, error: e.message });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const loadNode = useCallback(async (nodeKey, nodeType, force = false) => {
    if (!force && childrenRef.current[nodeKey]) {
      return childrenRef.current[nodeKey];
    }
    const inflightKey = `${nodeKey}:${force ? "force" : "cached"}`;
    if (inflightRef.current.has(inflightKey)) {
      return inflightRef.current.get(inflightKey);
    }

    const promise = (async () => {
      setLoadingNode((prev) => ({ ...prev, [nodeKey]: true }));
      try {
        let items = [];
        if (nodeKey === "root") {
          const res = await api("/api/confluence/space/children");
          items = res.children || [];
        } else if (nodeType === "folder") {
          const res = await api(`/api/confluence/folders/${nodeKey}`);
          items = res.children || [];
        } else {
          const res = await api(`/api/confluence/pages/${nodeKey}/children`);
          items = res.children || [];
        }
        setChildrenByParent((prev) => ({ ...prev, [nodeKey]: items }));
        return items;
      } catch (e) {
        setTreeError(e.message);
        return [];
      } finally {
        inflightRef.current.delete(inflightKey);
        setLoadingNode((prev) => ({ ...prev, [nodeKey]: false }));
      }
    })();

    inflightRef.current.set(inflightKey, promise);
    return promise;
  }, []);

  useEffect(() => {
    if (status?.configured && !childrenRef.current["root"]) {
      loadNode("root", "root");
    }
  }, [status?.configured, loadNode]);

  const toggleNode = useCallback(
    async (node) => {
      const next = !expandedRef.current[node.id];
      setExpanded((prev) => ({ ...prev, [node.id]: next }));
      if (next && !childrenRef.current[node.id]) {
        await loadNode(node.id, node.type);
      }
    },
    [loadNode],
  );

  const refreshTree = useCallback(
    async (parentId = "root", nodeType = "folder") => {
      return loadNode(parentId, nodeType, true);
    },
    [loadNode],
  );

  const homepageId = status?.space?.homepageId
    ? String(status.space.homepageId)
    : null;

  const revealPath = useCallback(
    async (ancestors = []) => {
      if (!ancestors || !ancestors.length) return;
      for (const a of ancestors) {
        if (homepageId && String(a.id) === homepageId) continue;
        setExpanded((prev) => (prev[a.id] ? prev : { ...prev, [a.id]: true }));
        if (!childrenRef.current[a.id]) {
          await loadNode(a.id, a.type);
        }
      }
    },
    [homepageId, loadNode],
  );

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(
          `/api/confluence/search?q=${encodeURIComponent(searchQuery.trim())}`,
        );
        setSearchResults(res.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function handleCreateRootFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await api("/api/confluence/folders", {
        method: "POST",
        body: { title: newFolderName.trim() },
      });
      setNewFolderName("");
      setShowNewFolder(false);
      await refreshTree("root");
    } catch (err) {
      alert(err.message || "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  const space = status?.space;

  const contextValue = {
    space,
    status,
    childrenByParent,
    setChildrenByParent,
    expanded,
    loadingNode,
    treeError,
    loadNode,
    toggleNode,
    refreshTree,
    revealPath,
  };

  if (statusLoading) {
    return (
      <div className="page-pad">
        <div className="output">
          <small>Checking Confluence connection…</small>
        </div>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="page-pad">
        <div className="output">
          <div className="empty">
            <h2>Confluence isn’t configured</h2>
            <p>
              {status?.error ||
                "Set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN and CONFLUENCE_SPACE_KEY in .env, then restart the server."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rootItems = childrenByParent["root"] || [];

  return (
    <ConfluenceContext.Provider value={contextValue}>
      <div className="cf-shell">
        <button
          type="button"
          className="cf-mobile-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? "✕ Close sidebar" : "☰ Space sidebar"}
        </button>

        <aside className={`cf-sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="cf-sidebar-head">
            <div className="cf-space-info">
              <span className="cf-space-badge">{space?.key || "SD"}</span>
              <div className="cf-space-text">
                <Link to="/confluence" className="cf-space-title">
                  {space?.name || "Space"}
                </Link>
                <small className="cf-space-key">~{space?.key}</small>
              </div>
            </div>
            <div className="cf-sidebar-actions">
              <button
                type="button"
                className="cf-icon-btn"
                onClick={() => refreshTree("root")}
                title="Refresh space tree"
                aria-label="Refresh space tree"
              >
                ↻
              </button>
              {space?.url && (
                <a
                  href={space.url}
                  target="_blank"
                  rel="noreferrer"
                  className="cf-icon-btn"
                  title="Open Space in Confluence"
                  aria-label="Open Space in Confluence"
                >
                  ↗
                </a>
              )}
            </div>
          </div>

          <div className="cf-quick-row">
            <Link to="/confluence/publish" className="cf-cta">
              + Publish plan
            </Link>
            <button
              type="button"
              className="cf-subtle-btn"
              onClick={() => setShowNewFolder((v) => !v)}
              title="Create folder at space root"
            >
              + New folder
            </button>
          </div>

          {showNewFolder && (
            <form onSubmit={handleCreateRootFolder} className="cf-inline-form">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Root folder name…"
                autoFocus
                disabled={creatingFolder}
              />
              <div className="cf-inline-btns">
                <button
                  type="submit"
                  className="btn solid small"
                  disabled={creatingFolder || !newFolderName.trim()}
                >
                  {creatingFolder ? "Creating…" : "Create"}
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
            </form>
          )}

          <div className="cf-search-box">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search space…"
              aria-label="Search space content"
            />
          </div>

          <div className="cf-tree-container">
            {searchQuery.trim() ? (
              <div className="cf-search-results">
                {searching && <small>Searching…</small>}
                {!searching && searchResults.length === 0 && (
                  <small>No matches for “{searchQuery}”</small>
                )}
                <ul className="cf-search-list">
                  {searchResults.map((r) => {
                    const isFolder = r.type === "folder";
                    const to = isFolder
                      ? `/confluence/folders/${r.id}`
                      : `/confluence/pages/${r.id}`;
                    return (
                      <li key={r.id}>
                        <Link to={to} className="cf-search-item">
                          <span className="cf-tree-icon">
                            {isFolder ? <FolderIcon /> : <PageIcon />}
                          </span>
                          <span className="cf-search-title">{r.title}</span>
                          <span className="cf-badge">{r.type}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <>
                {loadingNode["root"] && rootItems.length === 0 && (
                  <div className="cf-tree-loading" style={{ padding: "8px" }}>
                    Loading space tree…
                  </div>
                )}
                {treeError && (
                  <div className="cf-tree-error" role="alert">
                    {treeError}
                  </div>
                )}
                {!loadingNode["root"] && rootItems.length === 0 && !treeError && (
                  <div className="cf-tree-empty" style={{ padding: "8px" }}>
                    No root folders or pages found.
                  </div>
                )}
                <TreeList items={rootItems} level={0} />
              </>
            )}
          </div>
        </aside>

        <main className="cf-main">
          <Outlet context={contextValue} />
        </main>
      </div>
    </ConfluenceContext.Provider>
  );
}
