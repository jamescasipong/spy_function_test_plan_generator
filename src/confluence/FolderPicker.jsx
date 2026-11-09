import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";

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

function PageIcon() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export default function FolderPicker({
  space,
  mode,
  onModeChange,
  folderValue,
  onFolderChange,
  pageValue,
  onPageChange,
  overwriteExisting,
  onOverwriteExistingChange,
  urlCount = 1,
  disabled,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [browseFolderId, setBrowseFolderId] = useState(null);
  const [browseFolder, setBrowseFolder] = useState(null);
  const [browseChildren, setBrowseChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const searchInputRef = useRef(null);
  const browseFolderIdRef = useRef(browseFolderId);
  browseFolderIdRef.current = browseFolderId;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const folderIdRef = useRef(folderValue?.id || null);
  folderIdRef.current = folderValue?.id || null;

  const homepageId = space?.homepageId ? String(space.homepageId) : null;
  const spaceLabel = space?.name || "Space";

  const stripHomepage = useCallback(
    (ancestors = []) =>
      ancestors
        .filter((a) => !homepageId || String(a.id) !== homepageId)
        .map((a) => a.title),
    [homepageId],
  );

  const loadFolder = useCallback(async (folderId) => {
    setLoading(true);
    setError("");
    try {
      if (!folderId) {
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
      return true;
    } catch (err) {
      setError(err.message || "Could not load Confluence items.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    setSearchQuery("");
    setShowNewFolder(false);
    setNewFolderName("");
    const startId =
      modeRef.current === "folder"
        ? folderIdRef.current
        : browseFolderIdRef.current;
    loadFolder(startId).then((ok) => {
      if (!ok && startId) loadFolder(null);
    });
  }, [modalOpen, loadFolder]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen || !searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(
          `/api/confluence/search?q=${encodeURIComponent(searchQuery.trim())}`,
        );
        if (!cancelled) setSearchResults(res.results || []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modalOpen, searchQuery]);

  function chooseFolder(folder) {
    onModeChange("folder");
    if (!folder) {
      onFolderChange(null);
    } else {
      onFolderChange({
        id: folder.id,
        title: folder.title,
        path: [...stripHomepage(folder.ancestors || []), folder.title],
      });
    }
    setModalOpen(false);
  }

  function choosePage(page, pathTitles = []) {
    onModeChange("page");
    onPageChange({
      id: page.id,
      title: page.title,
      path: pathTitles,
    });
    setModalOpen(false);
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const created = await api("/api/confluence/folders", {
        method: "POST",
        body: {
          title: newFolderName.trim(),
          parentId: browseFolderId || undefined,
        },
      });
      setNewFolderName("");
      setShowNewFolder(false);
      await loadFolder(browseFolderId);
      onModeChange("folder");
      const currentPath = browseFolder
        ? [...stripHomepage(browseFolder.ancestors || []), browseFolder.title]
        : [];
      onFolderChange({
        id: created.id,
        title: created.title,
        path: [...currentPath, created.title],
      });
    } catch (err) {
      setError(err.message || "Failed to create folder.");
    } finally {
      setCreating(false);
    }
  }

  const currentBrowsePath = browseFolder
    ? [...stripHomepage(browseFolder.ancestors || []), browseFolder.title]
    : [];
  const folderChildren = browseChildren.filter((c) => c.type === "folder");
  const pageChildren = browseChildren.filter((c) => c.type === "page");
  const orderedChildren = [...folderChildren, ...pageChildren];
  const visibleAncestors = (browseFolder?.ancestors || []).filter(
    (a) => !homepageId || String(a.id) !== homepageId,
  );

  const destinationText =
    mode === "page"
      ? pageValue
        ? pageValue.path?.length
          ? `${spaceLabel} / ${pageValue.path.join(" / ")}`
          : pageValue.title
        : "No page selected yet"
      : folderValue
        ? `${spaceLabel} / ${folderValue.path.join(" / ")}`
        : `${spaceLabel} (Root)`;

  return (
    <div className="cf-dest-panel">
      <div className="cf-dest-summary">
        <div className="cf-dest-summary-top">
          <span className="cf-dest-label">
            {mode === "page" ? "Overwrite page" : "Create in folder"}
          </span>
          <button
            type="button"
            className="btn small"
            onClick={() => setModalOpen(true)}
            disabled={disabled}
          >
            Choose…
          </button>
        </div>

        <button
          type="button"
          className={`cf-dest-path-btn${mode === "page" && !pageValue ? " empty" : ""}`}
          onClick={() => setModalOpen(true)}
          disabled={disabled}
          title={destinationText}
        >
          {destinationText}
        </button>

        {mode === "page" && urlCount > 1 && (
          <small className="warn">
            Multiple URLs will overwrite this same page sequentially. Pick a
            folder with overwrite enabled for separate pages.
          </small>
        )}
      </div>

      {mode === "folder" && (
        <label className="cf-inline-check">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(e) => onOverwriteExistingChange(e.target.checked)}
            disabled={disabled}
          />
          <span>Overwrite existing page if title matches</span>
        </label>
      )}

      {modalOpen &&
        createPortal(
          <div
            className="cf-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div
              className="cf-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cf-modal-title"
            >
              <div className="cf-modal-head">
                <div>
                  <h2 id="cf-modal-title">Choose Confluence Destination</h2>
                  <p>
                    Pick a folder to create a new page in, or choose an existing
                    page to overwrite.
                  </p>
                </div>
                <button
                  type="button"
                  className="cf-icon-btn"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="cf-modal-toolbar">
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search folders and pages across space…"
                  aria-label="Search Confluence folders and pages"
                  autoFocus
                />

                {!searchQuery.trim() && (
                  <>
                    <div className="cf-picker-nav">
                      <span className="cf-picker-nav-label">Path:</span>
                      <button
                        type="button"
                        className={`cf-crumb-btn ${browseFolderId === null ? "active" : ""}`}
                        onClick={() => loadFolder(null)}
                        disabled={loading}
                      >
                        {spaceLabel}
                      </button>

                      {visibleAncestors.map((a) => (
                        <span key={a.id} className="cf-crumb-span">
                          <span className="cf-sep">/</span>
                          <button
                            type="button"
                            className="cf-crumb-btn"
                            onClick={() => loadFolder(a.id)}
                            disabled={loading}
                          >
                            {a.title}
                          </button>
                        </span>
                      ))}

                      {browseFolder && (
                        <span className="cf-crumb-span">
                          <span className="cf-sep">/</span>
                          <span className="cf-crumb-cur">
                            {browseFolder.title}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="cf-picker-select-row">
                      {browseFolder ? (
                        <button
                          type="button"
                          className={`btn small ${mode === "folder" && folderValue?.id === browseFolder.id ? "solid" : ""}`}
                          onClick={() => chooseFolder(browseFolder)}
                        >
                          {mode === "folder" &&
                          folderValue?.id === browseFolder.id
                            ? `✓ Creating in “${browseFolder.title}”`
                            : `Create new page in “${browseFolder.title}”`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`btn small ${mode === "folder" && folderValue === null ? "solid" : ""}`}
                          onClick={() => chooseFolder(null)}
                        >
                          {mode === "folder" && folderValue === null
                            ? "✓ Creating in Space Root"
                            : "Create new page in Space Root"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setShowNewFolder((v) => !v)}
                      >
                        + New folder
                      </button>
                    </div>

                    {showNewFolder && (
                      <div className="cf-picker-new-folder">
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCreateFolder();
                            }
                          }}
                          placeholder={`New folder inside ${browseFolder?.title || spaceLabel}…`}
                          disabled={creating}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn solid small"
                          onClick={handleCreateFolder}
                          disabled={creating || !newFolderName.trim()}
                        >
                          {creating ? "Creating…" : "Create"}
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => {
                            setShowNewFolder(false);
                            setNewFolderName("");
                          }}
                          disabled={creating}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="cf-modal-body">
                {error && (
                  <div className="error-box" role="alert">
                    <strong>Could not load Confluence items</strong>
                    <p>{error}</p>
                  </div>
                )}

                {searchQuery.trim() ? (
                  searching ? (
                    <small>Searching…</small>
                  ) : searchResults.length === 0 ? (
                    <div className="empty">
                      <p>No folders or pages match “{searchQuery.trim()}”.</p>
                    </div>
                  ) : (
                    <div className="cf-dir">
                      {searchResults.map((item) => {
                        const isFolder = item.type === "folder";
                        const isSelected = isFolder
                          ? mode === "folder" && folderValue?.id === item.id
                          : mode === "page" && pageValue?.id === item.id;
                        return (
                          <div key={item.id} className="cf-dir-row">
                            <span className="cf-dir-icon">
                              {isFolder ? <FolderIcon /> : <PageIcon />}
                            </span>
                            {isFolder ? (
                              <button
                                type="button"
                                className="cf-dir-title-btn"
                                onClick={() => {
                                  setSearchQuery("");
                                  loadFolder(item.id);
                                }}
                              >
                                {item.title}
                              </button>
                            ) : (
                              <span className="cf-dir-title">{item.title}</span>
                            )}
                            <span className="cf-badge">{item.type}</span>
                            <div className="cf-dir-actions">
                              {isFolder ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn small"
                                    onClick={() => {
                                      setSearchQuery("");
                                      loadFolder(item.id);
                                    }}
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn small ${isSelected ? "solid" : ""}`}
                                    onClick={async () => {
                                      try {
                                        const res = await api(
                                          `/api/confluence/folders/${item.id}`,
                                        );
                                        chooseFolder(res.folder);
                                      } catch {
                                        chooseFolder({
                                          id: item.id,
                                          title: item.title,
                                          ancestors: [],
                                        });
                                      }
                                    }}
                                  >
                                    {isSelected ? "✓ Selected" : "Create here"}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className={`btn small ${isSelected ? "solid" : ""}`}
                                  onClick={() => choosePage(item)}
                                >
                                  {isSelected ? "✓ Selected" : "Overwrite"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : loading ? (
                  <small>Loading folder contents…</small>
                ) : orderedChildren.length === 0 ? (
                  <div className="empty">
                    <p>
                      This folder has no subfolders or pages yet. You can
                      create a new page directly inside it above.
                    </p>
                  </div>
                ) : (
                  <div className="cf-dir">
                    {orderedChildren.map((item) => {
                      const isFolder = item.type === "folder";
                      const isSelected = isFolder
                        ? mode === "folder" && folderValue?.id === item.id
                        : mode === "page" && pageValue?.id === item.id;
                      const pagePath = [...currentBrowsePath, item.title];
                      return (
                        <div key={item.id} className="cf-dir-row">
                          <span className="cf-dir-icon">
                            {isFolder ? <FolderIcon /> : <PageIcon />}
                          </span>
                          {isFolder ? (
                            <button
                              type="button"
                              className="cf-dir-title-btn"
                              onClick={() => loadFolder(item.id)}
                            >
                              {item.title}
                            </button>
                          ) : (
                            <span className="cf-dir-title">{item.title}</span>
                          )}
                          <span className="cf-badge">{item.type}</span>
                          <div className="cf-dir-actions">
                            {isFolder ? (
                              <>
                                <button
                                  type="button"
                                  className="btn small"
                                  onClick={() => loadFolder(item.id)}
                                >
                                  Open ▸
                                </button>
                                <button
                                  type="button"
                                  className={`btn small ${isSelected ? "solid" : ""}`}
                                  onClick={() =>
                                    chooseFolder({
                                      id: item.id,
                                      title: item.title,
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
                                  {isSelected ? "✓ Selected" : "Create here"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={`btn small ${isSelected ? "solid" : ""}`}
                                onClick={() => choosePage(item, pagePath)}
                              >
                                {isSelected ? "✓ Selected" : "Overwrite"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="cf-modal-foot">
                <small className="cf-modal-current">
                  Current:{" "}
                  <strong>
                    {mode === "page"
                      ? pageValue
                        ? `Overwrite “${pageValue.title}”`
                        : "No page selected"
                      : folderValue
                        ? `Create in “${folderValue.path.join(" / ")}”`
                        : `Create in “${spaceLabel} (Root)”`}
                  </strong>
                </small>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
