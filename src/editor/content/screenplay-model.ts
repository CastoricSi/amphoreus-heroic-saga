import { plainRubyText } from "./rich-text-utils";
import { clone } from "./node-config";
import type { JsonNode, MissionIndex, MissionRef, NodePath, ScreenplayDocument, ScriptBlock, ScriptNodeAddress, ScriptTextMatch, SearchMode } from "./types";

export function findMessageOwner(nodes: JsonNode[]): string {
	for (const node of nodes) {
		if (node.type === "message" && node.side === "right" && typeof node.speaker === "string" && node.speaker) return node.speaker;
		if (Array.isArray(node.content)) { const owner = findMessageOwner(node.content as JsonNode[]); if (owner) return owner; }
	}
	return "";
}

export function normalizeMessageThreadContent(nodes: JsonNode[], owner: string): JsonNode[] {
	return nodes.map((node) => {
		const next = clone(node);
		if (next.type === "dialogue") return { type: "message", side: String(next.speaker ?? "") === owner ? "right" : "left", speaker: next.speaker, contentType: "text", text: next.text };
		if (next.type === "message") next.side = String(next.speaker ?? "") === owner ? "right" : "left";
		if (Array.isArray(next.content)) next.content = normalizeMessageThreadContent(next.content as JsonNode[], owner);
		return next;
	});
}

export function toMessageThread(node: JsonNode): JsonNode {
	const content = Array.isArray(node.content) ? node.content as JsonNode[] : [];
	const lines = String(node.title ?? "").split(/\n+/u).map((line) => line.trim()).filter(Boolean);
	const heading = node.type === "message-thread" ? { title: String(node.title ?? ""), subtitle: String(node.subtitle ?? "") } : { title: (lines.shift() ?? "").replace(/^短信\s*[：:]\s*/u, "").trim(), subtitle: lines.join(" ") };
	const owner = String(node.owner ?? findMessageOwner(content) ?? "").trim() || "开拓者";
	return { ...node, type: "message-thread", ...heading, owner, content: normalizeMessageThreadContent(content, owner) };
}

export function normalizeMessageThreads(node: JsonNode): JsonNode {
	if (node.type === "message-thread") return toMessageThread(node);
	if (!Array.isArray(node.content)) return node;
	let changed = false;
	const content = (node.content as JsonNode[]).map((child) => { const normalized = normalizeMessageThreads(child); if (normalized !== child) changed = true; return normalized; });
	return changed ? { ...node, content } : node;
}

function isMessageFold(node: JsonNode) {
	return node.type === "fold" && /^短信\s*[：:]/u.test(String(node.title ?? "")) && Boolean(findMessageOwner(Array.isArray(node.content) ? node.content as JsonNode[] : []));
}

export function groupLegacyMessageThreadNodes(nodes: JsonNode[]): JsonNode[] {
	const normalized = nodes.map((node) => {
		const next = clone(node);
		if (Array.isArray(next.content)) next.content = groupLegacyMessageThreadNodes(next.content as JsonNode[]);
		if (Array.isArray(next.options)) next.options = (next.options as JsonNode[]).map((option) => ({ ...option, ...(Array.isArray(option.content) ? { content: groupLegacyMessageThreadNodes(option.content as JsonNode[]) } : {}) }));
		if (Array.isArray(next.tabs)) next.tabs = (next.tabs as JsonNode[]).map((tab) => ({ ...tab, ...(Array.isArray(tab.content) ? { content: groupLegacyMessageThreadNodes(tab.content as JsonNode[]) } : {}) }));
		return next;
	});
	const grouped: JsonNode[] = [];
	for (let index = 0; index < normalized.length; index += 1) {
		const node = normalized[index];
		if (node.type !== "message-thread-start") { grouped.push(node); continue; }
		const endIndex = normalized.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.type === "message-thread-end");
		if (endIndex < 0) { grouped.push(node); continue; }
		const content = normalized.slice(index + 1, endIndex);
		grouped.push(toMessageThread({ type: "message-thread", title: node.title, subtitle: node.subtitle, owner: findMessageOwner(content) || "开拓者", collapsed: false, content }));
		index = endIndex;
	}
	return grouped;
}

export function expandChoiceOption(option: JsonNode, asMessage = false): JsonNode[] {
	const replies = Array.isArray(option.content) ? (option.content as JsonNode[]).flatMap(expandDialogueChoices) : [];
	if (asMessage) return replies.length ? replies : [{ type: "message", side: "right", speaker: "开拓者", contentType: "text", text: String(option.text ?? "") }];
	return [{ type: "dialogue", speaker: "开拓者", text: String(option.text ?? "") }, ...replies];
}

export function expandDialogueChoices(node: JsonNode): JsonNode[] {
	if (node.type === "choice" && Array.isArray(node.options)) {
		const asMessage = node.presentation === "message" || (node.options as JsonNode[]).some((option) => findMessageOwner(Array.isArray(option.content) ? option.content as JsonNode[] : []));
		return (node.options as JsonNode[]).flatMap((option) => expandChoiceOption(option, asMessage));
	}
	const next = clone(node);
	if (Array.isArray(next.content)) next.content = (next.content as JsonNode[]).flatMap(expandDialogueChoices);
	if (Array.isArray(next.tabs)) next.tabs = (next.tabs as JsonNode[]).map((tab) => ({ ...tab, ...(Array.isArray(tab.content) ? { content: (tab.content as JsonNode[]).flatMap(expandDialogueChoices) } : {}) }));
	return [isMessageFold(next) || next.type === "message-thread" ? toMessageThread(next) : next];
}

export function normalizeScriptBlocks(blocks: ScriptBlock[]) {
	let changed = false;
	const expanded = blocks.flatMap((block) => {
		const nodes = expandDialogueChoices(block.node);
		if (nodes.length !== 1 || JSON.stringify(nodes[0]) !== JSON.stringify(block.node)) changed = true;
		return nodes.map((node, index) => ({ ...block, id: index === 0 ? block.id : crypto.randomUUID(), node }));
	});
	const normalized: ScriptBlock[] = [];
	for (let index = 0; index < expanded.length; index += 1) {
		const block = expanded[index];
		if (block.node.type !== "message-thread-start") { normalized.push(block); continue; }
		const endIndex = expanded.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.node.type === "message-thread-end");
		if (endIndex < 0) { normalized.push(block); continue; }
		const content = expanded.slice(index + 1, endIndex).map((candidate) => candidate.node);
		normalized.push({ ...block, node: toMessageThread({ type: "message-thread", title: block.node.title, subtitle: block.node.subtitle, owner: findMessageOwner(content) || "开拓者", collapsed: false, content }) });
		changed = true; index = endIndex;
	}
	return { blocks: normalized, changed };
}

export function syncScreenplayCharacters(document: ScreenplayDocument) {
	const speakers: string[] = [];
	const seen = new Set<string>();
	const visit = (node: JsonNode) => {
		if ((node.type === "dialogue" || node.type === "message") && typeof node.speaker === "string") { const speaker = plainRubyText(node.speaker).trim(); if (speaker && !seen.has(speaker)) { seen.add(speaker); speakers.push(speaker); } }
		if (Array.isArray(node.content)) (node.content as JsonNode[]).forEach(visit);
		if (Array.isArray(node.options)) (node.options as JsonNode[]).forEach((option) => { if (Array.isArray(option.content)) (option.content as JsonNode[]).forEach(visit); });
		if (Array.isArray(node.tabs)) (node.tabs as JsonNode[]).forEach((tab) => { if (Array.isArray(tab.content)) (tab.content as JsonNode[]).forEach(visit); });
	};
	document.blocks.forEach((block) => visit(block.node));
	const hiddenSet = new Set(document.characters?.hidden ?? []);
	return { ...document, characters: { visible: speakers.filter((speaker) => !hiddenSet.has(speaker)), hidden: speakers.filter((speaker) => hiddenSet.has(speaker)) } };
}

export function collectScriptTextMatches(document: ScreenplayDocument | null, mode: SearchMode | null) {
	if (!document || !mode) return [];
	const matches: ScriptTextMatch[] = [];
	const fields = ["text", "title", "content", "subtitle"] as const;
	const visit = (node: JsonNode, address: ScriptNodeAddress) => {
		for (const field of fields) {
			const value = node[field]; if (typeof value !== "string") continue;
			if (mode === "gender") for (const match of value.matchAll(/他\/她|她\/他|少年\/少女|少女\/少年/gu)) { const term = match[0]; const start = match.index ?? 0; matches.push({ address, field, start, end: start + term.length, term, replacement: term.includes("少年") ? "少年" : "他" }); }
			else for (let start = value.indexOf("开拓者"); start >= 0; start = value.indexOf("开拓者", start + 3)) matches.push({ address, field, start, end: start + 3, term: "开拓者" });
		}
		if (Array.isArray(node.content)) (node.content as JsonNode[]).forEach((child, index) => visit(child, { blockId: address.blockId, path: [...address.path, index] }));
	};
	document.blocks.forEach((block) => visit(block.node, { blockId: block.id, path: [] }));
	return matches;
}

export function replaceDialogueSpeaker(node: JsonNode, from: string, to: string): JsonNode {
	const next = { ...node };
	if (next.type === "dialogue" && typeof next.speaker === "string" && plainRubyText(next.speaker).trim() === from) next.speaker = to;
	if (Array.isArray(next.content)) next.content = (next.content as JsonNode[]).map((child) => replaceDialogueSpeaker(child, from, to));
	if (Array.isArray(next.options)) next.options = (next.options as JsonNode[]).map((option) => ({ ...option, ...(Array.isArray(option.content) ? { content: (option.content as JsonNode[]).map((child) => replaceDialogueSpeaker(child, from, to)) } : {}) }));
	if (Array.isArray(next.tabs)) next.tabs = (next.tabs as JsonNode[]).map((tab) => ({ ...tab, ...(Array.isArray(tab.content) ? { content: (tab.content as JsonNode[]).map((child) => replaceDialogueSpeaker(child, from, to)) } : {}) }));
	return next;
}

function childNodePaths(node: JsonNode, path: NodePath): Array<{ node: JsonNode; path: NodePath }> {
	if (Array.isArray(node.content)) return (node.content as JsonNode[]).map((child, index) => ({ node: child, path: [...path, "content", index] }));
	if (node.type === "choice" && Array.isArray(node.options)) return (node.options as JsonNode[]).flatMap((option, optionIndex) => Array.isArray(option.content) ? (option.content as JsonNode[]).map((child, childIndex) => ({ node: child, path: [...path, "options", optionIndex, "content", childIndex] })) : []);
	if (node.type === "tabs" && Array.isArray(node.tabs)) return (node.tabs as JsonNode[]).flatMap((tab, tabIndex) => Array.isArray(tab.content) ? (tab.content as JsonNode[]).map((child, childIndex) => ({ node: child, path: [...path, "tabs", tabIndex, "content", childIndex] })) : []);
	return [];
}

export function collectNodePaths(nodes: JsonNode[]) {
	const paths: NodePath[] = [];
	const visit = (node: JsonNode, path: NodePath) => {
		paths.push(path);
		if (node.type === "choice" && Array.isArray(node.options)) { (node.options as JsonNode[]).forEach((option, optionIndex) => { const optionPath = [...path, "options", optionIndex] as NodePath; paths.push(optionPath); if (Array.isArray(option.content)) (option.content as JsonNode[]).forEach((child, childIndex) => visit(child, [...optionPath, "content", childIndex])); }); return; }
		for (const child of childNodePaths(node, path)) visit(child.node, child.path);
	};
	nodes.forEach((node, index) => visit(node, [index]));
	return paths;
}

export function nodeAtPath(nodes: JsonNode[], path: NodePath) {
	let value: unknown = nodes;
	for (const segment of path) { if ((typeof value !== "object" || value === null) && !Array.isArray(value)) return null; value = (value as Record<string | number, unknown>)[segment]; }
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonNode : null;
}

export function isAncestorPath(ancestor: NodePath, descendant: NodePath) { return ancestor.length < descendant.length && ancestor.every((segment, index) => segment === descendant[index]); }
export function nestedNodeAtPath(root: JsonNode, path: number[]) { let node = root; for (const index of path) { const content = Array.isArray(node.content) ? node.content as JsonNode[] : []; if (!content[index]) return null; node = content[index]; } return node; }
export function updateNestedNode(root: JsonNode, path: number[], update: (node: JsonNode) => JsonNode): JsonNode { if (!path.length) return update(root); const [index, ...rest] = path; const content = Array.isArray(root.content) ? root.content as JsonNode[] : []; if (!content[index]) return root; return { ...root, content: content.map((child, childIndex) => childIndex === index ? updateNestedNode(child, rest, update) : child) }; }
export function removeNestedNode(root: JsonNode, path: number[]): { root: JsonNode; node: JsonNode | null } { if (!path.length) return { root, node: null }; const [index, ...rest] = path; const content = Array.isArray(root.content) ? root.content as JsonNode[] : []; if (!content[index]) return { root, node: null }; if (!rest.length) return { root: { ...root, content: content.filter((_, childIndex) => childIndex !== index) }, node: content[index] }; const removed = removeNestedNode(content[index], rest); return { root: { ...root, content: content.map((child, childIndex) => childIndex === index ? removed.root : child) }, node: removed.node }; }
export function sameNumberPath(left: number[], right: number[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }
export function sameScriptAddress(left: ScriptNodeAddress, right: ScriptNodeAddress) { return left.blockId === right.blockId && sameNumberPath(left.path, right.path); }
export function scriptNodeDomId(address: ScriptNodeAddress) { return `script-node-${address.blockId}-${address.path.length ? address.path.join("-") : "root"}`; }
export function scriptSiblingGroup(address: ScriptNodeAddress) { return address.path.length ? `${address.blockId}:${JSON.stringify(address.path.slice(0, -1))}` : "root"; }
export function isNumberPathAncestor(ancestor: number[], descendant: number[]) { return ancestor.length < descendant.length && ancestor.every((value, index) => value === descendant[index]); }
export function adjustTargetPathAfterRemoval(target: number[], source: number[]) { if (!source.length) return target; const parent = source.slice(0, -1); if (target.length < source.length || !sameNumberPath(target.slice(0, parent.length), parent)) return target; const targetIndex = target[parent.length]; const sourceIndex = source.at(-1)!; if (targetIndex <= sourceIndex) return target; const adjusted = [...target]; adjusted[parent.length] = targetIndex - 1; return adjusted; }

export function flattenMissions(index: MissionIndex) {
	const missions: MissionRef[] = [];
	for (const [category, locations] of Object.entries(index)) for (const [location, seriesList] of Object.entries(locations)) for (const series of seriesList) for (const entry of series.children?.length ? series.children : [series]) if (entry.dataFile) missions.push({ ...entry, category, location, series: series.name, dataFile: entry.dataFile });
	return missions;
}
