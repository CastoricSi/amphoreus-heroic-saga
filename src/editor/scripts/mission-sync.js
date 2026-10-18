import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchMissionPages, flattenMissionIndex } from "./mission-fetch.js";
import { fetchMissionIndex, MISSION_CATEGORIES } from "./mission-index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "../../..");
const dataDirectory = path.join(projectDirectory, "data");
const missionDirectory = path.join(dataDirectory, "missions");
const indexPath = path.join(dataDirectory, "missions.json");

async function readCurrentIndex() {
  try { return JSON.parse(await readFile(indexPath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function fileExists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function pageHasLocalFiles(page) {
  const sourcePath = path.resolve(dataDirectory, page.sourceFile);
  const dataPath = path.resolve(dataDirectory, page.dataFile);
  const prefix = `${missionDirectory}${path.sep}`;
  if (!sourcePath.startsWith(prefix) || !dataPath.startsWith(prefix)) throw new Error(`任务索引包含意外路径：${page.dataFile}`);
  return await fileExists(sourcePath) && await fileExists(dataPath);
}

async function clearFetchedMissionDirectories() {
  for (const category of MISSION_CATEGORIES) {
    const target = path.resolve(missionDirectory, category);
    if (path.dirname(target) !== missionDirectory) throw new Error(`拒绝清理意外路径：${target}`);
    await rm(target, { recursive: true, force: true });
  }
  console.log("已清理三个任务分类的旧文件；data/missions/剧本 保持不变");
}

async function run(mode) {
  if (!["update", "reset"].includes(mode)) throw new Error("用法：node scripts/mission-sync.js <update|reset>");

  const previousIndex = mode === "update" ? await readCurrentIndex() : {};
  const previousLinks = new Set(flattenMissionIndex(previousIndex).map((page) => page.link));
  const { missions } = await fetchMissionIndex({ existingIndex: mode === "update" ? previousIndex : null });
  const allPages = flattenMissionIndex(missions);

  let pages;
  if (mode === "reset") {
    await clearFetchedMissionDirectories();
    pages = allPages;
  } else {
    const candidates = await Promise.all(allPages.map(async (page) => ({ page, missing: !await pageHasLocalFiles(page) })));
    pages = candidates.filter(({ page, missing }) => !previousLinks.has(page.link) || missing).map(({ page }) => page);
    const newCount = pages.filter((page) => !previousLinks.has(page.link)).length;
    const repairedCount = pages.length - newCount;
    console.log(`索引检查完成：${allPages.length} 个页面，新增 ${newCount} 个，本地缺失 ${repairedCount} 个`);
  }

  if (!pages.length) {
    console.log("没有需要获取的任务页面。");
    return;
  }

  const report = await fetchMissionPages({ index: missions, pages, refresh: mode === "reset", mode });
  const failures = report.pages.filter((page) => page.status === "error");
  if (failures.length) {
    process.exitCode = 1;
    console.error(`${failures.length} 个任务获取失败，请查看 data/mission-fetch-report.json`);
  }
}

run(process.argv[2]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
