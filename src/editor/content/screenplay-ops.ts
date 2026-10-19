import { clone } from "./node-config";
import { adjustTargetPathAfterRemoval, isNumberPathAncestor, nestedNodeAtPath, normalizeMessageThreads, removeNestedNode, sameNumberPath, scriptSiblingGroup, toMessageThread, updateNestedNode } from "./screenplay-model";
import type { JsonNode, ScreenplayDocument, ScriptItem, ScriptNodeAddress } from "./types";

/*
 * Pure screenplay editing operations. Each takes the current document plus the addresses it acts on and
 * returns the next document and the selection to show, or null when the operation does not apply.
 *
 * A screenplay has two kinds of sibling lists: the top-level `blocks` (which carry an id and a source) and
 * the `content` of a fold / message thread. `editSiblings` hides that difference so every operation is
 * written once against a plain list of items.
 */

export interface OperationResult {
	document: ScreenplayDocument;
	selection: ScriptNodeAddress | null;
}

interface SiblingEdit {
	items: ScriptItem[];
	// Index in the new list to select, "parent" for the containing node (nothing at top level), or null.
	select: number | "parent" | null;
}

export function isContainerNode(node: JsonNode | null | undefined) {
	return node?.type === "fold" || node?.type === "message-thread";
}

function contentOf(node: JsonNode) {
	return Array.isArray(node.content) ? node.content as JsonNode[] : [];
}

function freshItem(item: ScriptItem): ScriptItem {
	return { ...(item.source ? { source: clone(item.source) } : {}), node: clone(item.node) };
}

export function nodeAtAddress(document: ScreenplayDocument, address: ScriptNodeAddress) {
	const block = document.blocks.find((candidate) => candidate.id === address.blockId);
	return block ? nestedNodeAtPath(block.node, address.path) : null;
}

export function updateNodeAt(document: ScreenplayDocument, address: ScriptNodeAddress, update: (node: JsonNode) => JsonNode): ScreenplayDocument {
	return { ...document, blocks: document.blocks.map((block) => block.id === address.blockId ? { ...block, node: normalizeMessageThreads(updateNestedNode(block.node, address.path, update)) } : block) };
}

function editSiblings(document: ScreenplayDocument, address: ScriptNodeAddress, edit: (items: ScriptItem[], index: number) => SiblingEdit | null): OperationResult | null {
	if (!address.path.length) {
		const index = document.blocks.findIndex((block) => block.id === address.blockId);
		if (index < 0) return null;
		const result = edit(document.blocks, index);
		if (!result) return null;
		const blocks = result.items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() }));
		const selected = typeof result.select === "number" ? blocks[result.select] : undefined;
		return { document: { ...document, blocks }, selection: selected ? { blockId: selected.id, path: [] } : null };
	}
	const parentPath = address.path.slice(0, -1);
	const parentAddress = { blockId: address.blockId, path: parentPath };
	const parent = nodeAtAddress(document, parentAddress);
	if (!parent) return null;
	const result = edit(contentOf(parent).map((node) => ({ node })), address.path.at(-1)!);
	if (!result) return null;
	const content = result.items.map((item) => item.node);
	const selection = typeof result.select === "number" && content[result.select] ? { blockId: address.blockId, path: [...parentPath, result.select] } : result.select === null ? null : parentAddress;
	return { document: updateNodeAt(document, parentAddress, (node) => ({ ...node, content })), selection };
}

// Sorted sibling indexes for addresses that share one sibling list, or null when they do not.
function siblingIndexes(document: ScreenplayDocument, addresses: ScriptNodeAddress[]) {
	if (!addresses.length || addresses.some((address) => scriptSiblingGroup(address) !== scriptSiblingGroup(addresses[0]))) return null;
	const indexes = addresses.map((address) => address.path.length ? address.path.at(-1)! : document.blocks.findIndex((block) => block.id === address.blockId));
	return indexes.some((index) => index < 0) ? null : [...new Set(indexes)].sort((left, right) => left - right);
}

export function siblingRange(document: ScreenplayDocument, from: ScriptNodeAddress, to: ScriptNodeAddress): ScriptNodeAddress[] | null {
	if (scriptSiblingGroup(from) !== scriptSiblingGroup(to)) return null;
	const indexes = siblingIndexes(document, [from, to]);
	if (!indexes) return null;
	const [start, end] = [indexes[0], indexes.at(-1)!];
	if (!from.path.length) return document.blocks.slice(start, end + 1).map((block) => ({ blockId: block.id, path: [] }));
	const parentPath = from.path.slice(0, -1);
	return Array.from({ length: end - start + 1 }, (_, offset) => ({ blockId: from.blockId, path: [...parentPath, start + offset] }));
}

/** Inserts after the selection, inside it when `intoContainer` and it is a fold/thread, or at the end when nothing is selected. */
export function insertItems(document: ScreenplayDocument, selection: ScriptNodeAddress | null, items: ScriptItem[], { intoContainer }: { intoContainer: boolean }): OperationResult | null {
	if (!items.length) return null;
	const inserted = items.map(freshItem);
	const target = selection ? nodeAtAddress(document, selection) : null;
	if (!selection || !target) {
		const blocks = inserted.map((item) => ({ ...item, id: crypto.randomUUID() }));
		return { document: { ...document, blocks: [...document.blocks, ...blocks] }, selection: { blockId: blocks.at(-1)!.id, path: [] } };
	}
	if (intoContainer && isContainerNode(target)) {
		const length = contentOf(target).length;
		return { document: updateNodeAt(document, selection, (node) => ({ ...node, content: [...contentOf(node), ...inserted.map((item) => item.node)] })), selection: { blockId: selection.blockId, path: [...selection.path, length + inserted.length - 1] } };
	}
	return editSiblings(document, selection, (siblings, index) => ({ items: [...siblings.slice(0, index + 1), ...inserted, ...siblings.slice(index + 1)], select: index + inserted.length }));
}

export function dissolveContainer(document: ScreenplayDocument, address: ScriptNodeAddress) {
	const container = nodeAtAddress(document, address);
	if (!isContainerNode(container)) return null;
	const children = contentOf(container!).map((node) => ({ node: clone(node) }));
	return editSiblings(document, address, (siblings, index) => ({ items: [...siblings.slice(0, index), ...children, ...siblings.slice(index + 1)], select: children.length ? index : "parent" }));
}

export function foldSiblings(document: ScreenplayDocument, addresses: ScriptNodeAddress[], title: string) {
	const indexes = siblingIndexes(document, addresses);
	if (!indexes || indexes.length < 2) return null;
	const selected = new Set(indexes);
	return editSiblings(document, addresses[0], (siblings) => {
		const fold = { node: { type: "fold", title, content: siblings.filter((_, index) => selected.has(index)).map((item) => clone(item.node)) } };
		const remaining = siblings.filter((_, index) => !selected.has(index));
		return { items: [...remaining.slice(0, indexes[0]), fold, ...remaining.slice(indexes[0])], select: indexes[0] };
	});
}

/** Joins adjacent dialogues of one speaker into the first; the first keeps its id and source. */
export function mergeDialogues(document: ScreenplayDocument, addresses: ScriptNodeAddress[]) {
	const indexes = siblingIndexes(document, addresses);
	if (!indexes || indexes.length < 2 || indexes.some((index, offset) => index !== indexes[0] + offset)) return null;
	return editSiblings(document, addresses[0], (siblings) => {
		const group = indexes.map((index) => siblings[index]);
		if (group.some((item) => item?.node.type !== "dialogue" || item.node.speaker !== group[0].node.speaker)) return null;
		const merged = { ...group[0], node: { ...group[0].node, text: group.map((item) => String(item.node.text ?? "")).join("") } };
		return { items: [...siblings.slice(0, indexes[0]), merged, ...siblings.slice(indexes[0] + indexes.length)], select: indexes[0] };
	});
}

export function splitDialogue(document: ScreenplayDocument, address: ScriptNodeAddress, offset: number) {
	return editSiblings(document, address, (siblings, index) => {
		const item = siblings[index];
		if (item?.node.type !== "dialogue") return null;
		const text = String(item.node.text ?? "");
		const cut = Math.max(0, Math.min(offset, text.length));
		const first = { ...item, node: { ...item.node, text: text.slice(0, cut).replace(/[，\s]+$/u, "") } };
		const second = { ...freshItem(item), node: { ...clone(item.node), text: text.slice(cut).replace(/^[，\s]+/u, "") } };
		return { items: [...siblings.slice(0, index), first, second, ...siblings.slice(index + 1)], select: index + 1 };
	});
}

export function removeSiblings(document: ScreenplayDocument, addresses: ScriptNodeAddress[]) {
	const indexes = siblingIndexes(document, addresses);
	if (!indexes) return null;
	const selected = new Set(indexes);
	return editSiblings(document, addresses[0], (siblings) => ({ items: siblings.filter((_, index) => !selected.has(index)), select: "parent" }));
}

/** Removes the addressed siblings and returns them as clipboard items; selects the item just before the cut. */
export function cutSiblings(document: ScreenplayDocument, addresses: ScriptNodeAddress[]) {
	const indexes = siblingIndexes(document, addresses);
	if (!indexes) return null;
	const selected = new Set(indexes);
	let clipboard: ScriptItem[] = [];
	const result = editSiblings(document, addresses[0], (siblings) => {
		clipboard = indexes.map((index) => freshItem(siblings[index]));
		const remaining = siblings.filter((_, index) => !selected.has(index));
		return { items: remaining, select: remaining.length ? Math.min(Math.max(indexes[0] - 1, 0), remaining.length - 1) : "parent" };
	});
	return result && clipboard.length ? { result, clipboard } : null;
}

/** Single-text node types that can be converted into each other without losing content. */
export const convertibleTextTypes = ["dialogue", "narration", "text", "note", "section"] as const;
export type ConvertibleTextType = typeof convertibleTextTypes[number];

export function isConvertibleTextNode(node: JsonNode | null | undefined) {
	return convertibleTextTypes.includes(node?.type as ConvertibleTextType);
}

function convertTextNode(node: JsonNode, type: ConvertibleTextType): JsonNode {
	if (node.type === type) return node;
	const text = String((node.type === "section" ? node.title : node.text) ?? "");
	const images = Array.isArray(node.images) ? { images: node.images } : {};
	if (type === "dialogue") return { type, speaker: typeof node.speaker === "string" && node.speaker ? node.speaker : "？？？", text, ...images };
	if (type === "section") return { type, level: 2, title: text };
	return { type, text, ...images };
}

/** Converts every addressed text node to `type`; addresses that are not text nodes make it a no-op. */
export function convertTextNodes(document: ScreenplayDocument, addresses: ScriptNodeAddress[], type: ConvertibleTextType): OperationResult | null {
	if (!addresses.length || !addresses.every((address) => isConvertibleTextNode(nodeAtAddress(document, address)))) return null;
	const next = addresses.reduce((current, address) => updateNodeAt(current, address, (node) => convertTextNode(node, type)), document);
	return { document: next, selection: addresses[0] };
}

/** Message thread back to a plain fold; messages stay as they are. */
export function messageThreadToFold(document: ScreenplayDocument, address: ScriptNodeAddress): OperationResult | null {
	if (nodeAtAddress(document, address)?.type !== "message-thread") return null;
	return { document: updateNodeAt(document, address, (node) => ({ type: "fold", title: node.title, ...(node.collapsed ? { collapsed: true } : {}), content: contentOf(node) })), selection: address };
}

/** Drag and drop: moves `dragged` before `target`, or to the end of `target` when nesting into a fold/thread. */
export function moveNode(document: ScreenplayDocument, target: ScriptNodeAddress, dragged: ScriptNodeAddress, nest: boolean): OperationResult | null {
	if (target.blockId === dragged.blockId && (sameNumberPath(target.path, dragged.path) || isNumberPathAncestor(dragged.path, target.path))) return null;
	const sourceBlock = document.blocks.find((block) => block.id === dragged.blockId);
	if (!sourceBlock) return null;
	let blocks = document.blocks;
	let draggedNode: JsonNode | null = sourceBlock.node;
	if (!dragged.path.length) {
		blocks = blocks.filter((block) => block.id !== sourceBlock.id);
	} else {
		const removed = removeNestedNode(sourceBlock.node, dragged.path);
		draggedNode = removed.node;
		blocks = blocks.map((block) => block.id === sourceBlock.id ? { ...block, node: removed.root } : block);
	}
	if (!draggedNode) return null;
	const moved = draggedNode;
	const targetPath = target.blockId === dragged.blockId ? adjustTargetPathAfterRemoval(target.path, dragged.path) : target.path;
	const targetBlock = blocks.find((block) => block.id === target.blockId);
	const targetNode = targetBlock ? nestedNodeAtPath(targetBlock.node, targetPath) : null;
	if (!targetBlock || !targetNode) return null;
	const withBlocks = { ...document, blocks };
	if (nest && isContainerNode(targetNode)) {
		const nested = { ...withBlocks, blocks: blocks.map((block) => block.id === targetBlock.id ? { ...block, node: updateNestedNode(block.node, targetPath, (node) => {
			const updated = { ...node, content: [...contentOf(node), clone(moved)] };
			return node.type === "message-thread" ? toMessageThread(updated) : updated;
		}) } : block) };
		return { document: nested, selection: target };
	}
	// A top-level block keeps its id and source when it stays at top level.
	const item: ScriptItem = !dragged.path.length ? sourceBlock : { node: clone(moved) };
	const result = editSiblings(withBlocks, { blockId: target.blockId, path: targetPath }, (siblings, index) => ({ items: [...siblings.slice(0, index), item, ...siblings.slice(index)], select: index }));
	return result && { document: result.document, selection: target };
}
