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

export function childNodePaths(node: JsonNode, path: NodePath): Array<{ node: JsonNode; path: NodePath }> {
	const children: Array<{ node: JsonNode; path: NodePath }> = [];
	if (Array.isArray(node.content)) (node.content as JsonNode[]).forEach((child, index) => children.push({ node: child, path: [...path, "content", index] }));
	if (Array.isArray(node.options)) (node.options as JsonNode[]).forEach((option, optionIndex) => {
		const optionPath = [...path, "options", optionIndex] as NodePath;
		children.push({ node: option, path: optionPath });
	});
	if (Array.isArray(node.tabs)) (node.tabs as JsonNode[]).forEach((tab, tabIndex) => {
		const tabPath = [...path, "tabs", tabIndex] as NodePath;
		children.push({ node: tab, path: tabPath });
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
