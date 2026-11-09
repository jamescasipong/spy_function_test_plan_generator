import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useConfluence } from "./ConfluenceLayout.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";
import { api, handleArticleClick } from "./api.js";

function PageIcon() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

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

export default function PageView() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const { space, revealPath } = useConfluence();

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("rendered"); // 'rendered' | 'xml'

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    api(`/api/confluence/pages/${pageId}`)
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        if (data?.ancestors) {
          revealPath(data.ancestors);
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
  }, [pageId, revealPath]);

  if (loading) {
    return (
      <div className="output">
        <small>Loading page…</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-box" role="alert">
        <strong>Error loading page</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!page) return null;

  return (
    <div className="cf-content-view">
      <Breadcrumbs ancestors={page.ancestors} currentTitle={page.title} />

      <div className="cf-page-head">
        <div className="cf-page-meta">
          <span className="cf-page-avatar">
            <PageIcon />
          </span>
          <div>
            <h1>{page.title}</h1>
            <p>
              {page.version ? `v${page.version}` : ""}
              {page.version && page.status ? " · " : ""}
              {page.status ? `${page.status}` : ""}
            </p>
          </div>
        </div>

        <div className="actions">
          <div className="segmented" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "rendered"}
              className={viewMode === "rendered" ? "on" : ""}
              onClick={() => setViewMode("rendered")}
            >
              Rendered
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "xml"}
              className={viewMode === "xml" ? "on" : ""}
              onClick={() => setViewMode("xml")}
            >
              Storage XML
            </button>
          </div>
          {page.url && (
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Open in Confluence ↗
            </a>
          )}
        </div>
      </div>

      <section className="cf-section card">
        {viewMode === "rendered" ? (
          <article
            className="cf-article"
            onClick={(e) => handleArticleClick(e, space?.key, navigate)}
            dangerouslySetInnerHTML={{ __html: page.body || "<p><em>(Empty page)</em></p>" }}
          />
        ) : (
          <textarea
            className="raw"
            readOnly
            value={page.storageBody || "(No storage body)"}
          />
        )}
      </section>

      {page.children && page.children.length > 0 && (
        <section className="cf-section card">
          <div className="cf-section-head">
            <h2>Child items</h2>
            <small>{page.children.length} items</small>
          </div>

          <div className="cf-dir">
            {page.children.map((child) => {
              const isFolder = child.type === "folder";
              const to = isFolder
                ? `/confluence/folders/${child.id}`
                : `/confluence/pages/${child.id}`;
              return (
                <div key={child.id} className="cf-dir-row">
                  <span className="cf-dir-icon">
                    {isFolder ? <FolderIcon /> : <PageIcon />}
                  </span>
                  <Link to={to} className="cf-dir-title">
                    {child.title}
                  </Link>
                  <span className="cf-badge">{child.type}</span>
                  <div className="cf-dir-actions">
                    <Link to={to} className="btn small">
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
