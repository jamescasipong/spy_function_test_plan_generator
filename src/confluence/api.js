export { planTitle } from "../../shared/planFormat.js";

export async function api(url, opts) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts?.body && typeof opts.body === "object"
        ? { "Content-Type": "application/json" }
        : {}),
      ...opts?.headers,
    },
    body:
      opts?.body && typeof opts.body === "object"
        ? JSON.stringify(opts.body)
        : opts?.body,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      data.error ||
        text.slice(0, 200) ||
        `HTTP ${res.status}. Is the API server running?`,
    );
  }
  return data;
}

export function handleArticleClick(e, spaceKey, navigate) {
  const anchor = e.target.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href) return;
  if (spaceKey) {
    const pageMatch = href.match(
      new RegExp(`/spaces/${spaceKey}/pages/(\\d+)`, "i"),
    );
    if (pageMatch) {
      e.preventDefault();
      navigate(`/confluence/pages/${pageMatch[1]}`);
      return;
    }
    const folderMatch = href.match(
      new RegExp(`/spaces/${spaceKey}/folder/(\\d+)`, "i"),
    );
    if (folderMatch) {
      e.preventDefault();
      navigate(`/confluence/folders/${folderMatch[1]}`);
      return;
    }
  }
  if (/^https?:\/\//i.test(href)) {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer");
  }
}
