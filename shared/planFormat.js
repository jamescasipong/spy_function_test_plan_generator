export const normalizeProfile = (profile) =>
  !profile || profile === "none" ? "none" : profile;

export const normalizeViewport = (viewport) =>
  viewport === "mobile" ? "mobile" : "web";

export const profileLabel = (profile) => {
  if (!profile || profile === "none") return "Public";
  if (profile === "unknown") return "Unknown";
  return String(profile)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

export const authTone = (profile) => {
  if (!profile || profile === "none") return "public";
  if (profile === "learner") return "learner";
  if (profile === "provider") return "provider";
  return "other";
};

export const viewportLabel = (viewport) =>
  normalizeViewport(viewport) === "mobile" ? "Mobile" : "Web";

export function planTitle(url, profile, viewport = "web") {
  const isAuthed = profile && profile !== "none" && profile !== "unknown";
  const isMobile = normalizeViewport(viewport) === "mobile";
  let tag = "";
  if (isAuthed && isMobile) tag = ` [${profileLabel(profile)} · Mobile]`;
  else if (isAuthed) tag = ` [${profileLabel(profile)}]`;
  else if (isMobile) tag = " [Mobile]";

  try {
    const u = new URL(url);
    const cleanPath =
      u.pathname === "/" ? "Home" : u.pathname.replace(/^\/|\/$/g, "");
    return `Test Plan${tag}: ${cleanPath} (${u.hostname})`;
  } catch {
    return `Test Plan${tag}: ${url}`;
  }
}

