import { Link } from "react-router-dom";
import { useConfluence } from "./ConfluenceLayout.jsx";

export default function Breadcrumbs({
  ancestors = [],
  currentTitle,
  space: propSpace,
}) {
  const ctx = useConfluence();
  const space = propSpace || ctx?.space;
  const homepageId = space?.homepageId ? String(space.homepageId) : null;

  const validAncestors = (ancestors || []).filter(
    (a) => !homepageId || String(a.id) !== homepageId,
  );

  return (
    <nav className="cf-breadcrumbs" aria-label="Breadcrumb">
      <Link to="/confluence">{space?.name || "Space"}</Link>
      {validAncestors.map((a) => {
        const to =
          a.type === "folder"
            ? `/confluence/folders/${a.id}`
            : `/confluence/pages/${a.id}`;
        return (
          <span key={a.id} className="cf-breadcrumb-item">
            <span className="cf-sep">/</span>
            <Link to={to}>{a.title}</Link>
          </span>
        );
      })}
      {currentTitle && (
        <span className="cf-breadcrumb-item">
          <span className="cf-sep">/</span>
          <span className="cf-breadcrumb-current" aria-current="page">
            {currentTitle}
          </span>
        </span>
      )}
    </nav>
  );
}
