import type { CSSProperties } from "react";
import type { JsonNode, NodePath } from "./types";

export function editorAssetUrl(asset: unknown) {
	if (typeof asset !== "string" || !asset.startsWith("assets/")) return "";
	return `/editor-assets/${asset.slice("assets/".length).split("/").map(encodeURIComponent).join("/")}`;
}

export function imageDisplayStyle(displayWidth: unknown): CSSProperties {
	return typeof displayWidth === "string" && displayWidth.trim()
		? { width: displayWidth, maxWidth: "100%" }
		: { maxWidth: "100%" };
}

export function pathKey(path: NodePath) {
	return JSON.stringify(path);
}

export function sourceNodeDomId(path: NodePath) {
	return `source-node-${path.map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, "-")).join("-")}`;
}

/** Paths in a mission's read-only source tree: `content` children, choice options (selectable), and the contents of each tab. */
export function childNodePaths(node: JsonNode, path: NodePath): Array<{ node: JsonNode; path: NodePath }> {
	const children: Array<{ node: JsonNode; path: NodePath }> = [];
	if (Array.isArray(node.content)) (node.content as JsonNode[]).forEach((child, index) => children.push({ node: child, path: [...path, "content", index] }));
	if (Array.isArray(node.options)) (node.options as JsonNode[]).forEach((option, optionIndex) => children.push({ node: option, path: [...path, "options", optionIndex] }));
	if (Array.isArray(node.tabs)) (node.tabs as JsonNode[]).forEach((tab, tabIndex) => {
		if (Array.isArray(tab.content)) (tab.content as JsonNode[]).forEach((child, childIndex) => children.push({ node: child, path: [...path, "tabs", tabIndex, "content", childIndex] }));
	});
	return children;
}

export function descendantNodePaths(node: JsonNode, path: NodePath) {
	const paths: NodePath[] = [];
	for (const child of childNodePaths(node, path)) {
		paths.push(child.path, ...descendantNodePaths(child.node, child.path));
	}
	return paths;
}

/** Every selectable path of a mission source tree, in reading order. */
export function collectNodePaths(nodes: JsonNode[]) {
	const paths: NodePath[] = [];
	const visit = (node: JsonNode, path: NodePath) => {
		paths.push(path);
		for (const child of childNodePaths(node, path)) visit(child.node, child.path);
	};
	nodes.forEach((node, index) => visit(node, [index]));
	return paths;
}

export function nodeAtPath(nodes: JsonNode[], path: NodePath) {
	let value: unknown = nodes;
	for (const segment of path) { if (typeof value !== "object" || value === null) return null; value = (value as Record<string | number, unknown>)[segment]; }
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonNode : null;
}

export function isAncestorPath(ancestor: NodePath, descendant: NodePath) {
	return ancestor.length < descendant.length && ancestor.every((segment, index) => segment === descendant[index]);
}
