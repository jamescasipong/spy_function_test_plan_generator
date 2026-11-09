import JSZip from "jszip";
import {
  profileLabel,
  authTone,
  viewportLabel,
} from "../shared/planFormat.js";

export { profileLabel, authTone, viewportLabel };

export const slug = (url) =>
  new URL(url).pathname.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "home";

export const countCases = (md) =>
  new Set(md.match(/TC-[A-Za-z]+-\d+-\d+/g) || []).size;

export const planFilename = (url, profile, ext = "md", viewport = "web") =>
  `${slug(url)}${profile && profile !== "none" && profile !== "unknown" ? `_${profile}` : ""}${viewport === "mobile" ? "_mobile" : ""}_test_plan.${ext}`;

export const saveBlob = (name, blob) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const download = (name, text) =>
  saveBlob(name, new Blob([text], { type: "text/markdown" }));

export async function downloadZip(items) {
  const zip = new JSZip();
  const used = new Set();
  for (const it of items) {
    const base = `${new URL(it.url).hostname}_${slug(it.url)}${it.profile && it.profile !== "none" && it.profile !== "unknown" ? `_${it.profile}` : ""}${it.viewport === "mobile" ? "_mobile" : ""}_test_plan`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    zip.file(`${name}.md`, it.markdown);
    if (it.key && it.hasScreenshot) {
      try {
        const res = await fetch(`/api/plans/${it.key}/screenshot`);
        if (res.ok) zip.file(`${name}.png`, await res.blob());
      } catch {
        /* skip screenshot, keep the plan */
      }
    }
  }
  saveBlob(
    "SpeedyCourse_Test_Plans.zip",
    await zip.generateAsync({ type: "blob" }),
  );
}
