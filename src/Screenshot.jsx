import { slug, viewportLabel } from "./utils.js";

export default function Screenshot({ plan }) {
  if (!plan.hasScreenshot) {
    return (
      <div className="empty">
        <p>
          No screenshot is saved for this plan. Plans generated before this
          feature have none. Run it again with “Overwrite” to capture one.
        </p>
      </div>
    );
  }
  const isMobile = plan.viewport === "mobile";
  const src = `/api/plans/${plan.key}/screenshot?v=${encodeURIComponent(plan.generatedAt || "")}`;
  return (
    <div className={`shot-wrap ${isMobile ? "mobile" : ""}`}>
      <div className="actions">
        <span className={`viewport-badge role-${plan.viewport || "web"}`}>
          {isMobile ? "Mobile View (390×844)" : "Web View (1440×900)"}
        </span>
        <a className="btn" href={src} target="_blank" rel="noreferrer">
          Open full size
        </a>
        <a
          className="btn"
          href={src}
          download={`${slug(plan.url)}${isMobile ? "_mobile" : ""}_screenshot.png`}
        >
          Download .png
        </a>
      </div>
      <div className={`shot ${isMobile ? "mobile" : ""}`}>
        <img
          src={src}
          alt={`${isMobile ? "Mobile" : "Desktop"} full-page screenshot of ${plan.url}`}
          loading="lazy"
        />
      </div>
    </div>
  );
}
