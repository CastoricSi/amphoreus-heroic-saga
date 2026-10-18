import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRevision, sourceMetadata } from "./sr-bwiki-client.js";
import { collectMissionImageNames, createImageAssetStore } from "./sr-image-assets.js";
import { collectTemplateNames, countNodeTypes, parseStarRailMission } from "./sr-wikitext-parser.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "../../..");
const dataDirectory = path.join(projectDirectory, "data");
const indexPath = path.join(dataDirectory, "missions.json");
const reportPath = path.join(dataDirectory, "mission-fetch-report.json");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

function missionOutputPath(relativePath) {
  const resolved = path.resolve(dataDirectory, relativePath);
  if (!resolved.startsWith(`${path.join(dataDirectory, "missions")}${path.sep}`)) throw new Error(`任务索引包含意外路径：${relativePath}`);
  return resolved;
}

export function flattenMissionIndex(index) {
  const pagesByLink = new Map();
  for (const [category, locations] of Object.entries(index)) {
    for (const [location, seriesList] of Object.entries(locations)) {
      for (const series of seriesList) {
        const pages = series.children?.length ? series.children : [series];
        for (const page of pages) {
          if (!page.sourceFile || !page.dataFile) {
            throw new Error(`索引条目缺少本地文件链接：${category} / ${location} / ${series.name} / ${page.name}`);
          }
          const reference = { category, location, series: series.name, name: page.name };
          const existing = pagesByLink.get(page.link);
          if (existing) {
            existing.references.push(reference);
            continue;
          }
          pagesByLink.set(page.link, {
            name: page.name,
            link: page.link,
            sourceFile: page.sourceFile,
            dataFile: page.dataFile,
            references: [reference],
          });
        }
      }
    }
  }
  return [...pagesByLink.values()];
}

function inspectPage(page, revision, parsed) {
  const nodeTypes = countNodeTypes(parsed.content);
  const templateNames = collectTemplateNames(revision.wikitext);
  const issues = [...parsed.warnings];
  const rawChoiceCount = (templateNames.剧情选项 ?? 0) + (templateNames.短信选项 ?? 0);
  const rawFoldCount = (templateNames.折叠 ?? 0) + (templateNames.折叠框 ?? 0);
  const rawTabCount = (revision.wikitext.match(/<(?:tabber|tabs)>/gi) ?? []).length;

  if ((nodeTypes.choice ?? 0) !== rawChoiceCount) {
    issues.push(`选项模板 ${rawChoiceCount} 个，但 JSON choice 节点 ${nodeTypes.choice ?? 0} 个`);
  }
  const parsedFoldCount = (nodeTypes.fold ?? 0) + (nodeTypes["message-thread"] ?? 0);
  if (parsedFoldCount !== rawFoldCount) {
    issues.push(`折叠模板 ${rawFoldCount} 个，但 JSON 容器节点 ${parsedFoldCount} 个`);
  }
  if ((nodeTypes.tabs ?? 0) !== rawTabCount) {
    issues.push(`分页结构 ${rawTabCount} 个，但 JSON tabs 节点 ${nodeTypes.tabs ?? 0} 个`);
  }
  if (nodeTypes.template) issues.push(`仍有 ${nodeTypes.template} 个未分类模板节点`);

  const comparableMissionName = parsed.mission?.name?.replaceAll("•", "·");
  const comparableTitle = revision.title.replaceAll("•", "·").replace(/（任务）$/, "");
  if (comparableMissionName && comparableMissionName !== comparableTitle) {
    issues.push(`任务模板名称“${parsed.mission.name}”与页面标题“${revision.title}”不同`);
  }

  return {
    name: page.name,
    actualTitle: revision.title,
    link: page.link,
    sourceFile: page.sourceFile,
    dataFile: page.dataFile,
    references: page.references,
    revisionId: revision.revisionId,
    status: issues.length ? "warning" : "ok",
    issues,
    nodeTypes,
    templateNames,
  };
}

async function saveReport(report) {
  const totals = report.pages.reduce((result, page) => {
    result[page.status] = (result[page.status] ?? 0) + 1;
    return result;
  }, {});
  const content = `${JSON.stringify({ ...report, totals }, null, 2)}\n`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(reportPath, content, "utf8");
      return;
    } catch (error) {
      if (attempt >= 5 || !["EBUSY", "EPERM", "UNKNOWN"].includes(error.code)) throw error;
      await delay(150 * (attempt + 1));
    }
  }
}

export async function fetchMissionPages({ index, pages: requestedPages, refresh = false, mode = "update" }) {
  const imageStore = await createImageAssetStore(projectDirectory);
  const missionIndex = index ?? JSON.parse(await readFile(indexPath, "utf8"));
  const pages = requestedPages ?? flattenMissionIndex(missionIndex);
  const referenceCount = pages.reduce((total, page) => total + page.references.length, 0);
  const report = {
    schemaVersion: 1,
    mode,
    sourceIndex: path.relative(projectDirectory, indexPath).replaceAll("\\", "/"),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    uniquePages: pages.length,
    indexReferences: referenceCount,
    pages: [],
  };
  console.log(`索引条目 ${referenceCount} 个，去重后页面 ${pages.length} 个`);

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const sourcePath = missionOutputPath(page.sourceFile);
    const jsonPath = missionOutputPath(page.dataFile);
    process.stdout.write(`[${index + 1}/${pages.length}] ${page.name} ... `);

    try {
      if (!refresh && await exists(sourcePath) && await exists(jsonPath)) {
        const savedSource = await readFile(sourcePath, "utf8");
        const savedJson = JSON.parse(await readFile(jsonPath, "utf8"));
        const revision = {
          title: savedJson.source?.title ?? page.name,
          revisionId: savedJson.source?.revisionId ?? null,
          wikitext: savedSource,
        };
        const reparsed = parseStarRailMission(savedSource, savedJson.source ?? {});
        await imageStore.ensureAll(collectMissionImageNames(savedSource));
        imageStore.attach(reparsed);
        const inspection = inspectPage(page, revision, reparsed);
        await writeFile(jsonPath, `${JSON.stringify(reparsed, null, 2)}\n`, "utf8");
        report.pages.push({ ...inspection, cached: true });
        console.log(inspection.issues.length ? `已有，警告 ${inspection.issues.length}` : "已有，重新解析");
        await saveReport(report);
        continue;
      }

      const revision = await fetchRevision(page.link, {
        onRetry: ({ status, attempt, delay: retryDelay }) =>
          process.stdout.write(`HTTP ${status}，第 ${attempt} 次退避 ${retryDelay / 1000}s ... `),
      });
      const parsed = parseStarRailMission(revision.wikitext, sourceMetadata(revision));
      await imageStore.ensureAll(collectMissionImageNames(revision.wikitext));
      imageStore.attach(parsed);
      const inspection = inspectPage(page, revision, parsed);
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, revision.wikitext, "utf8");
      await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      report.pages.push(inspection);
      console.log(inspection.issues.length ? `警告 ${inspection.issues.length}` : "OK");
    } catch (error) {
      report.pages.push({
        name: page.name,
        link: page.link,
        sourceFile: page.sourceFile,
        dataFile: page.dataFile,
        references: page.references,
        status: "error",
        error: error.message,
      });
      console.log(`ERROR: ${error.message}`);
    }

    await saveReport(report);
    await delay(350);
  }

  report.finishedAt = new Date().toISOString();
  await saveReport(report);
  console.log(`完成。报告：${path.relative(projectDirectory, reportPath)}`);
  return report;
}
