import { marked } from "marked";

const cfg = () => {
  const {
    CONFLUENCE_BASE_URL: base,
    CONFLUENCE_EMAIL: email,
    CONFLUENCE_API_TOKEN: token,
    CONFLUENCE_SPACE_KEY: space,
  } = process.env;
  if (!base || !email || !token || !space) {
    throw new Error(
      "Confluence is not configured. Set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN and CONFLUENCE_SPACE_KEY in .env.",
    );
  }
  return {
    base: base.replace(/\/+$/, ""),
    space,
    auth: Buffer.from(`${email}:${token}`).toString("base64"),
  };
};

export const isConfigured = () =>
  Boolean(
    process.env.CONFLUENCE_BASE_URL &&
    process.env.CONFLUENCE_EMAIL &&
    process.env.CONFLUENCE_API_TOKEN &&
    process.env.CONFLUENCE_SPACE_KEY,
  );

async function cf(method, p, body) {
  const { base, auth } = cfg();
  const res = await fetch(`${base}${p}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail =
      data.errors?.[0]?.title ||
      data.message ||
      text.slice(0, 200) ||
      res.statusText;
    throw Object.assign(new Error(`Confluence ${res.status}: ${detail}`), {
      status: res.status,
    });
  }
  return data;
}

const link = (o) =>
  o?._links?.base && o?._links?.webui
    ? `${o._links.base}${o._links.webui}`
    : null;

export const mdToStorage = (md) =>
  marked
    .parse(md.replace(/^```(?:markdown)?\s*\n([\s\S]*?)\n```\s*$/, "$1"), {
      gfm: true,
      async: false,
    })
    .replace(/<(br|hr)\s*>/g, "<$1/>")
    .replace(/<img([^>]*?)(?<!\/)>/g, "<img$1/>");

let spaceCache;
export async function getSpace() {
  if (spaceCache) return spaceCache;
  const { space, base } = cfg();
  const data = await cf(
    "GET",
    `/wiki/api/v2/spaces?keys=${encodeURIComponent(space)}`,
  );
  const s = data.results?.[0];
  if (!s)
    throw new Error(
      `Space "${space}" was not found, or this account can't see it.`,
    );
  const webBase = data._links?.base || `${base}/wiki`;
  return (spaceCache = {
    id: String(s.id),
    key: s.key,
    name: s.name,
    homepageId: s.homepageId ? String(s.homepageId) : null,
    url: s._links?.webui ? `${webBase}${s._links.webui}` : null,
  });
}

export async function fetchAncestors(id) {
  try {
    const d = await cf("GET", `/wiki/rest/api/content/${id}?expand=ancestors`);
    return (d.ancestors || []).map((a) => ({
      id: String(a.id),
      type: a.type,
      title: a.title,
    }));
  } catch {
    return [];
  }
}

async function paginateDirectChildren(kind, id) {
  const out = [];
  let next = `/wiki/api/v2/${kind}/${id}/direct-children?limit=100`;
  for (let i = 0; next && i < 10; i++) {
    let path = next;
    if (path.startsWith("http")) {
      const u = new URL(path);
      path = u.pathname + u.search;
    }
    const data = await cf("GET", path);
    out.push(
      ...(data.results || []).map((c) => ({
        id: String(c.id),
        type: c.type,
        title: c.title,
        status: c.status,
        childPosition: c.childPosition ?? null,
      })),
    );
    next = data._links?.next || null;
  }
  return out;
}

export const listFolderChildren = (id) => paginateDirectChildren("folders", id);
export const listPageChildren = (id) => paginateDirectChildren("pages", id);

export async function getFolder(id) {
  const [f, ancestors] = await Promise.all([
    cf("GET", `/wiki/api/v2/folders/${id}`),
    fetchAncestors(id),
  ]);
  return {
    id: String(f.id),
    title: f.title,
    parentId: f.parentId ? String(f.parentId) : null,
    parentType: f.parentType,
    spaceId: f.spaceId,
    url: link(f),
    ancestors,
  };
}

export async function listSpaceRootContent() {
  const space = await getSpace();
  const itemMap = new Map();

  if (space.homepageId) {
    const children = await paginateDirectChildren("pages", space.homepageId);
    for (const c of children) {
      itemMap.set(String(c.id), c);
    }
    try {
      const rootPages = await cf(
        "GET",
        `/wiki/api/v2/spaces/${space.id}/pages?depth=root&limit=100`,
      );
      for (const p of rootPages.results || []) {
        if (
          String(p.id) !== String(space.homepageId) &&
          !itemMap.has(String(p.id))
        ) {
          itemMap.set(String(p.id), {
            id: String(p.id),
            type: "page",
            title: p.title,
            status: p.status,
            childPosition: p.childPosition ?? null,
          });
        }
      }
    } catch {
      // depth=root can fail on some Confluence spaces; children under homepageId are already captured.
    }
  } else {
    const { space: spaceKey } = cfg();
    const cql = `space="${spaceKey}" AND type IN (page, folder)`;
    const data = await cf(
      "GET",
      `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&expand=ancestors&limit=100`,
    );
    for (const r of data.results || []) {
      if (!r.ancestors || r.ancestors.length === 0) {
        itemMap.set(String(r.id), {
          id: String(r.id),
          type: r.type,
          title: r.title,
          status: r.status,
          childPosition: null,
        });
      }
    }
  }

  const items = Array.from(itemMap.values());
  items.sort((a, b) => {
    const aFold = a.type === "folder" ? 0 : 1;
    const bFold = b.type === "folder" ? 0 : 1;
    if (aFold !== bFold) return aFold - bFold;
    const aPos = a.childPosition ?? Number.MAX_SAFE_INTEGER;
    const bPos = b.childPosition ?? Number.MAX_SAFE_INTEGER;
    if (aPos !== bPos) return aPos - bPos;
    return (a.title || "").localeCompare(b.title || "");
  });
  return items;
}

export async function createFolder({ title, parentId }) {
  if (!title?.trim()) throw new Error("Folder title is required.");
  const { id: spaceId, homepageId } = await getSpace();
  const targetParent = parentId || homepageId;
  const f = await cf("POST", "/wiki/api/v2/folders", {
    spaceId,
    title: title.trim(),
    ...(targetParent ? { parentId: targetParent } : {}),
  });
  return {
    id: String(f.id),
    title: f.title,
    parentId: f.parentId ? String(f.parentId) : null,
    url: link(f),
  };
}

export async function createPage({ title, parentId, markdown }) {
  if (!title?.trim()) throw new Error("Page title is required.");
  const { id: spaceId, homepageId } = await getSpace();
  const targetParent = parentId || homepageId;
  const payload = {
    spaceId,
    status: "current",
    title: title.trim(),
    body: { representation: "storage", value: mdToStorage(markdown || "") },
  };
  if (targetParent) payload.parentId = targetParent;

  try {
    const p = await cf("POST", "/wiki/api/v2/pages", payload);
    return {
      id: String(p.id),
      title: p.title,
      parentId: p.parentId ? String(p.parentId) : null,
      url: link(p),
    };
  } catch (e) {
    if (
      !targetParent ||
      /already exists|title/i.test(e.message) ||
      ![400, 404, 500].includes(e.status)
    ) {
      throw e;
    }
    delete payload.parentId;
    const p = await cf("POST", "/wiki/api/v2/pages", payload);
    await cf(
      "PUT",
      `/wiki/rest/api/content/${p.id}/move/append/${targetParent}`,
    );
    return {
      id: String(p.id),
      title: p.title,
      parentId: targetParent,
      url: link(p),
      moved: true,
    };
  }
}

export async function findPageByTitle(title) {
  if (!title?.trim()) return null;
  const { id: spaceId } = await getSpace();
  const clean = title.trim();
  const data = await cf(
    "GET",
    `/wiki/api/v2/pages?space-id=${encodeURIComponent(spaceId)}&status=current&title=${encodeURIComponent(clean)}&limit=10`,
  );
  const exact = (data.results || []).find(
    (p) => (p.title || "").toLowerCase() === clean.toLowerCase(),
  );
  return exact
    ? {
        id: String(exact.id),
        title: exact.title,
        status: exact.status,
        parentId: exact.parentId ? String(exact.parentId) : null,
        version: exact.version?.number ?? 1,
        url: link(exact),
      }
    : null;
}

export async function updatePage({ id, title, markdown, parentId }) {
  if (!id) throw new Error("Page ID is required.");
  const existing = await cf("GET", `/wiki/api/v2/pages/${id}`);
  const nextVersion = (existing.version?.number || 0) + 1;
  const nextTitle = title?.trim() || existing.title;

  const p = await cf("PUT", `/wiki/api/v2/pages/${id}`, {
    id: String(id),
    status: existing.status || "current",
    title: nextTitle,
    body: {
      representation: "storage",
      value: mdToStorage(markdown || ""),
    },
    version: {
      number: nextVersion,
    },
  });

  let moved = false;
  if (parentId && String(existing.parentId || "") !== String(parentId)) {
    await cf("PUT", `/wiki/rest/api/content/${p.id}/move/append/${parentId}`);
    moved = true;
  }

  return {
    id: String(p.id),
    title: p.title,
    parentId: parentId
      ? String(parentId)
      : p.parentId
        ? String(p.parentId)
        : null,
    url: link(p) || link(existing),
    updated: true,
    version: p.version?.number ?? nextVersion,
    ...(moved ? { moved: true } : {}),
  };
}

export async function getPage(id) {
  let content;
  let children = [];
  try {
    [content, children] = await Promise.all([
      cf(
        "GET",
        `/wiki/rest/api/content/${id}?expand=body.view,body.storage,ancestors,version`,
      ),
      listPageChildren(id).catch(() => []),
    ]);
  } catch {
    const p = await cf(
      "GET",
      `/wiki/api/v2/pages/${id}?body-format=view,storage`,
    );
    const ancestors = await fetchAncestors(id);
    children = await listPageChildren(id).catch(() => []);
    content = {
      id: p.id,
      title: p.title,
      status: p.status,
      version: p.version,
      body: {
        view: { value: p.body?.view?.value ?? "" },
        storage: { value: p.body?.storage?.value ?? "" },
      },
      ancestors,
      _links: p._links,
    };
  }

  const { base } = cfg();
  let viewHtml = content.body?.view?.value ?? "";
  viewHtml = viewHtml.replace(/href="\/wiki\//g, `href="${base}/wiki/`);
  const storageHtml = content.body?.storage?.value ?? "";

  const webBase = content._links?.base || `${base}/wiki`;
  const webui = content._links?.webui;
  const pageUrl =
    link(content) ||
    (webui
      ? webui.startsWith("/wiki")
        ? `${base}${webui}`
        : `${webBase}${webui}`
      : null);

  const ancestors = (content.ancestors || []).map((a) => ({
    id: String(a.id),
    type: a.type,
    title: a.title,
  }));

  return {
    id: String(content.id),
    title: content.title,
    status: content.status,
    version: content.version?.number,
    body: viewHtml,
    storageBody: storageHtml,
    url: pageUrl,
    ancestors,
    children,
  };
}

export async function searchContent(query) {
  if (!query?.trim()) return [];
  const { space } = cfg();
  const escaped = query.trim().replace(/["\\]/g, "\\$&");
  const cql = `space="${space}" AND type IN (page, folder) AND title~"${escaped}"`;
  const data = await cf(
    "GET",
    `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=25`,
  );
  return (data.results || []).map((r) => ({
    id: String(r.id),
    type: r.type,
    title: r.title,
  }));
}
