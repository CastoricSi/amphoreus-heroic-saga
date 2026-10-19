import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeFilename } from "./sr-bwiki-client.js";

const USER_AGENT = "castorice-star-rail-mission-fetcher/1.0";
const FILE_REDIRECT = "https://wiki.biligame.com/sr/Special:Redirect/file/";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function collectMissionImageNames(source) {
  const names = new Set();
  const add = (value) => {
    const name = String(value ?? "").trim().replace(/^File:/iu, "");
    if (name) names.add(name);
  };
  for (const match of source.matchAll(/\[\[(?:File|文件):\s*([^|\]\n]+)/giu)) add(match[1]);
  for (const match of source.matchAll(/\{\{图片放大\s*\|\s*([^|}\n]+)/gu)) add(match[1]);
  for (const match of source.matchAll(/\{\{角色对话\s*\|[^|}\n]*\|[^|}\n]*\|\s*图片\s*\|\s*([^|}\n]+)/gu)) add(match[1]);
  for (const match of source.matchAll(/\{\{角色对话\s*\|[^|}\n]*\|[^|}\n]*\|\s*表情\s*\|\s*([^|}\n]+)/gu)) add(`聊天表情-${match[1].trim()}.png`);
  return [...names];
}

function walkNodes(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const key of ["content", "options", "tabs"]) {
    if (Array.isArray(value[key])) value[key].forEach((child) => walkNodes(child, visit));
  }
}

export function attachMissionImageAssets(document, manifest) {
  walkNodes(document, (node) => {
    const file = typeof node.file === "string" ? node.file : node.type === "message" && typeof node.image === "string" ? node.image : "";
    const entry = file ? manifest.files[file] : null;
    if (entry?.localPath) node.asset = entry.localPath;
    if (Array.isArray(node.images)) {
      node.images = node.images.map((image) => {
        if (!image || typeof image !== "object" || typeof image.file !== "string") return image;
        const imageEntry = manifest.files[image.file];
        return imageEntry?.localPath ? { ...image, asset: imageEntry.localPath } : image;
      });
    }
  });
  return document;
}

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function fetchImage(name, retries = 4) {
  const url = `${FILE_REDIRECT}${encodeURIComponent(name)}`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", headers: { Accept: "image/*", "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mime = response.headers.get("content-type") ?? "";
      if (!mime.startsWith("image/")) throw new Error(`返回内容不是图片：${mime || "未知类型"}`);
      return { buffer: Buffer.from(await response.arrayBuffer()), url: response.url, mime };
    } catch (error) {
      if (attempt >= retries) throw error;
      await wait(Math.min(15000, 1200 * (attempt + 1)));
    }
  }
}

export async function createImageAssetStore(projectDirectory) {
  const assetDirectory = path.join(projectDirectory, "data", "assets", "sr-images");
  const manifestPath = path.join(assetDirectory, "manifest.json");
  await mkdir(assetDirectory, { recursive: true });
  let manifest = { schemaVersion: 1, updatedAt: null, files: {} };
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* first run */ }

  const save = async () => {
    manifest.updatedAt = new Date().toISOString();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  };

  const ensureOne = async (name) => {
    const existing = manifest.files[name];
    if (existing?.localPath && await exists(path.join(projectDirectory, "data", existing.localPath))) return { name, status: "cached", entry: existing };
    const localName = safeFilename(name);
    const localPath = path.posix.join("assets", "sr-images", localName);
    const outputPath = path.join(assetDirectory, localName);
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    const image = await fetchImage(name);
    await writeFile(temporaryPath, image.buffer);
    try { await rename(temporaryPath, outputPath); } catch (error) { try { await unlink(temporaryPath); } catch { /* ignore */ } throw error; }
    const entry = {
      file: name,
      localPath,
      sourceUrl: image.url,
      mime: image.mime,
      bytes: image.buffer.length,
      sha256: createHash("sha256").update(image.buffer).digest("hex"),
    };
    manifest.files[name] = entry;
    return { name, status: "downloaded", entry };
  };

  const ensureAll = async (names, options = {}) => {
    const unique = [...new Set(names)].sort((left, right) => left.localeCompare(right, "zh-CN"));
    const results = new Array(unique.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < unique.length) {
        const index = cursor++;
        const name = unique[index];
        try { results[index] = await ensureOne(name); }
        catch (error) { results[index] = { name, status: "error", error: error instanceof Error ? error.message : String(error) }; }
        options.onProgress?.(results[index], index + 1, unique.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, unique.length || 1) }, worker));
    await save();
    return results;
  };

  return { manifest, manifestPath, assetDirectory, ensureAll, attach: (document) => attachMissionImageAssets(document, manifest), save };
}
