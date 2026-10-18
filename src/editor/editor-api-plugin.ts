import { promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { parseBlocks, parseStarRailMission } from "./scripts/sr-wikitext-parser.js";

const workspaceRoot = path.resolve(process.cwd());
const dataRoot = path.join(workspaceRoot, "data");
const missionRoot = path.join(dataRoot, "missions");
const screenplayRoot = path.join(missionRoot, "剧本");
const assetRoot = path.join(dataRoot, "assets");
const imageManifestPath = path.join(assetRoot, "sr-images", "manifest.json");

type JsonRecord = Record<string, unknown>;

function sendJson(response: ServerResponse, status: number, value: unknown) {
	response.statusCode = status;
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.end(`${JSON.stringify(value)}\n`);
}

function assetContentType(filePath: string) {
	const extension = path.extname(filePath).toLowerCase();
	return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function screenplayPath(name: string) {
	const normalized = name.trim();
	if (!normalized || path.basename(normalized) !== normalized || !/^[^\\/:*?"<>|]+\.json$/iu.test(normalized)) {
		throw new Error("剧本文件名无效");
	}
	return path.join(screenplayRoot, normalized);
}

function screenplayId(document: JsonRecord, fileName: string) {
	const value = typeof document.id === "string" ? document.id : path.basename(fileName, path.extname(fileName));
	return /^\d{3}$/u.test(value) ? value : "";
}

function visibleTextLength(value: string) {
	const visible = value
		.replace(/\{\{([^{}|]+)\|[^{}]+\}\}/gu, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
		.replace(/\s/gu, "");
	return Array.from(visible).length;
}

function screenplayCharacterCount(blocks: unknown[]) {
	let count = 0;
	const visit = (value: unknown) => {
		if (!value || typeof value !== "object") return;
		const node = value as JsonRecord;
		for (const field of ["text", "title", "subtitle", "location", "note"]) {
			if (typeof node[field] === "string") count += visibleTextLength(node[field]);
		}
		if (typeof node.content === "string") count += visibleTextLength(node.content);
		for (const field of ["content", "options", "tabs"]) {
			if (Array.isArray(node[field])) node[field].forEach(visit);
		}
		if (node.node && typeof node.node === "object") visit(node.node);
	};
	blocks.forEach(visit);
	return count;
}

function missionPath(relativePath: string) {
	const fullPath = path.resolve(dataRoot, relativePath);
	const prefix = `${missionRoot}${path.sep}`;
	if (!fullPath.startsWith(prefix) || path.extname(fullPath).toLowerCase() !== ".json") {
		throw new Error("任务路径不在只读任务目录中");
	}
	return fullPath;
}

async function readBody(request: IncomingMessage) {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > 50 * 1024 * 1024) throw new Error("请求内容超过 50 MB");
		chunks.push(buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRecord;
}

async function listScreenplays() {
	await fs.mkdir(screenplayRoot, { recursive: true });
	const entries = await fs.readdir(screenplayRoot, { withFileTypes: true });
	const items = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && /\.json$/iu.test(entry.name))
			.map(async (entry) => {
				const fullPath = path.join(screenplayRoot, entry.name);
				const [text, stat] = await Promise.all([
					fs.readFile(fullPath, "utf8"),
					fs.stat(fullPath),
				]);
				try {
					const document = JSON.parse(text) as JsonRecord;
					const characters = document.characters && typeof document.characters === "object" ? document.characters as JsonRecord : {};
					const blocks = Array.isArray(document.blocks) ? document.blocks : [];
					return {
						name: entry.name,
						id: screenplayId(document, entry.name),
						title: typeof document.title === "string" ? document.title : entry.name,
						chapter: typeof document.chapter === "string" ? document.chapter : typeof document.description === "string" ? document.description : "",
						characters: Array.isArray(characters.visible) ? characters.visible.filter((value): value is string => typeof value === "string") : [],
						blockCount: blocks.length,
						characterCount: screenplayCharacterCount(blocks),
						updatedAt:
							typeof document.updatedAt === "string"
								? document.updatedAt
								: stat.mtime.toISOString(),
					};
				} catch {
					return {
						name: entry.name,
						id: "",
						title: entry.name,
						chapter: "",
						characters: [],
						blockCount: 0,
						characterCount: 0,
						updatedAt: stat.mtime.toISOString(),
						invalid: true,
					};
				}
			}),
	);
	return items.sort((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name));
}

async function listImageAssets() {
	const manifest = JSON.parse(await fs.readFile(imageManifestPath, "utf8")) as JsonRecord;
	const files = manifest.files && typeof manifest.files === "object" ? manifest.files as Record<string, JsonRecord> : {};
	return Object.entries(files)
		.map(([name, entry]) => ({
			file: typeof entry.file === "string" ? entry.file : name,
			asset: typeof entry.localPath === "string" ? entry.localPath : "",
			mime: typeof entry.mime === "string" ? entry.mime : "",
			bytes: typeof entry.bytes === "number" ? entry.bytes : 0,
		}))
		.filter((entry) => entry.asset.startsWith("assets/sr-images/"))
		.sort((left, right) => left.file.localeCompare(right.file, "zh-CN"));
}

async function reorderScreenplays(order: string[]) {
	const current = (await fs.readdir(screenplayRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.json$/iu.test(entry.name)).map((entry) => entry.name);
	if (order.length !== current.length || new Set(order).size !== order.length || current.some((name) => !order.includes(name))) throw new Error("剧本顺序与磁盘文件不一致，请刷新后重试");
	const documents = await Promise.all(order.map(async (name) => JSON.parse(await fs.readFile(screenplayPath(name), "utf8")) as JsonRecord));
	const token = crypto.randomUUID();
	const stagingRoot = path.join(screenplayRoot, `.reorder-${token}`);
	const generatedRoot = path.join(stagingRoot, "generated");
	const backupRoot = path.join(stagingRoot, "backup");
	await fs.mkdir(generatedRoot, { recursive: true }); await fs.mkdir(backupRoot, { recursive: true });
	const now = new Date().toISOString();
	try {
		for (let index = 0; index < documents.length; index += 1) {
			const id = String(index + 1).padStart(3, "0");
			const saved = { ...documents[index], schemaVersion: 2, id, updatedAt: now };
			await fs.writeFile(path.join(generatedRoot, `${id}.json`), `${JSON.stringify(saved, null, 2)}\n`, "utf8");
		}
		for (const name of current) await fs.rename(screenplayPath(name), path.join(backupRoot, name));
		for (let index = 0; index < documents.length; index += 1) {
			const id = String(index + 1).padStart(3, "0");
			await fs.rename(path.join(generatedRoot, `${id}.json`), path.join(screenplayRoot, `${id}.json`));
		}
		await fs.rm(stagingRoot, { recursive: true, force: true });
	} catch (error) {
		for (const name of current) {
			const backup = path.join(backupRoot, name);
			try { await fs.access(backup); await fs.rename(backup, screenplayPath(name)); } catch { /* retain recoverable staging data */ }
		}
		throw error;
	}
	return listScreenplays();
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
	const url = new URL(request.url ?? "/", "http://localhost");
	const pathname = url.pathname;

	if (request.method === "GET" && pathname.startsWith("/editor-assets/")) {
		const relativePath = decodeURIComponent(pathname.slice("/editor-assets/".length));
		const fullPath = path.resolve(assetRoot, relativePath);
		if (!fullPath.startsWith(`${assetRoot}${path.sep}`)) throw new Error("资源路径无效");
		const content = await fs.readFile(fullPath);
		response.statusCode = 200;
		response.setHeader("Content-Type", assetContentType(fullPath));
		response.setHeader("Cache-Control", "public, max-age=3600");
		response.end(content);
		return;
	}

	if (request.method === "GET" && pathname === "/editor-api/bootstrap") {
		const [indexText, screenplays] = await Promise.all([
			fs.readFile(path.join(dataRoot, "missions.json"), "utf8"),
			listScreenplays(),
		]);
		sendJson(response, 200, { index: JSON.parse(indexText), screenplays });
		return;
	}

	if (request.method === "GET" && pathname === "/editor-api/mission") {
		const relativePath = url.searchParams.get("path") ?? "";
		const text = await fs.readFile(missionPath(relativePath), "utf8");
		sendJson(response, 200, JSON.parse(text));
		return;
	}

	if (request.method === "GET" && pathname === "/editor-api/screenplays") {
		sendJson(response, 200, await listScreenplays());
		return;
	}

	if (request.method === "GET" && pathname === "/editor-api/images") {
		sendJson(response, 200, await listImageAssets());
		return;
	}

	if (request.method === "POST" && pathname === "/editor-api/reorder-screenplays") {
		const body = await readBody(request);
		if (!Array.isArray(body.order) || !body.order.every((value) => typeof value === "string")) throw new Error("剧本顺序格式无效");
		sendJson(response, 200, await reorderScreenplays(body.order));
		return;
	}

	if (request.method === "POST" && pathname === "/editor-api/parse-wikitext") {
		const body = await readBody(request);
		const source = String(body.source ?? "");
		if (!source.trim()) throw new Error("源代码为空");
		const content = /^==\s*剧情内容\s*==\s*$/mu.test(source) ? parseStarRailMission(source).content : parseBlocks(source);
		sendJson(response, 200, { content });
		return;
	}

	if (pathname === "/editor-api/screenplay") {
		const name = url.searchParams.get("name") ?? "";
		const fullPath = screenplayPath(name);
		if (request.method === "GET") {
			const text = await fs.readFile(fullPath, "utf8");
			sendJson(response, 200, JSON.parse(text));
			return;
		}
		if (request.method === "PUT") {
			const document = await readBody(request);
			if (!Array.isArray(document.blocks)) throw new Error("剧本必须包含 blocks 数组");
			const now = new Date().toISOString();
			const saved = {
				...document,
				schemaVersion: 2,
				createdAt: typeof document.createdAt === "string" ? document.createdAt : now,
				updatedAt: now,
			};
			await fs.mkdir(screenplayRoot, { recursive: true });
			await fs.writeFile(fullPath, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
			sendJson(response, 200, saved);
			return;
		}
		if (request.method === "DELETE") {
			await fs.unlink(fullPath);
			const remaining = await listScreenplays();
			if (remaining.length) await reorderScreenplays(remaining.map((item) => item.name));
			sendJson(response, 200, { ok: true });
			return;
		}
	}

	sendJson(response, 404, { error: "接口不存在" });
}

export function screenplayEditorApi(): Plugin {
	return {
		name: "screenplay-editor-api",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (!request.url?.startsWith("/editor-api/") && !request.url?.startsWith("/editor-assets/")) {
					next();
					return;
				}
				void handleRequest(request, response).catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					const code = (error as NodeJS.ErrnoException).code;
					sendJson(response, code === "ENOENT" ? 404 : 400, { error: message });
				});
			});
		},
	};
}
