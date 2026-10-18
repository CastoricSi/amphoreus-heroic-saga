import { useState, type DragEvent, type MouseEvent } from "react";
import { IconButton } from "../ui";
import { BufferedInput } from "../ui/BufferedFields";
import { IconCopy, IconGripVertical, IconLanguageHiragana } from "../ui/icons";
import { CollapsibleContent } from "./CollapsibleContent";
import { EditableContent, MessageThreadHeadingFields } from "./EditableContent";
import { ReadOnlyContent } from "./ReadOnlyContent";
import { HighlightedRichText } from "./RichText";
import { collectRubyAnnotations, plainRubyText } from "./rich-text-utils";
import { sameScriptAddress, scriptNodeDomId } from "./screenplay-model";
import type { JsonNode, ScriptBlock, ScriptNodeAddress, ScriptTextMatch } from "./types";

async function copyToClipboard(text: string) {
	await navigator.clipboard.writeText(text);
}

interface ScriptHierarchyNodeProps {
	blockId: string;
	node: JsonNode;
	path: number[];
	level: number;
	selectedAddresses: ScriptNodeAddress[];
	editableAddress: ScriptNodeAddress | null;
	activeMatch: ScriptTextMatch | null;
	onSelect: (address: ScriptNodeAddress, shiftKey: boolean) => void;
	onChange: (path: number[], node: JsonNode) => void;
	onDrop: (target: ScriptNodeAddress, dragged: ScriptNodeAddress, nest: boolean) => void;
	onDialogueCursor: (address: ScriptNodeAddress, offset: number) => void;
}

function ScriptHierarchyNode({ blockId, node, path, level, selectedAddresses, editableAddress, activeMatch, onSelect, onChange, onDrop, onDialogueCursor }: ScriptHierarchyNodeProps) {
	const [dragOver, setDragOver] = useState(false);
	const isMessageThread = node.type === "message-thread";
	const isContainer = node.type === "fold" || isMessageThread;
	const address = { blockId, path };
	const selected = selectedAddresses.some((candidate) => sameScriptAddress(candidate, address));
	const editable = editableAddress ? sameScriptAddress(editableAddress, address) : false;
	const content = Array.isArray(node.content) ? node.content as JsonNode[] : [];
	const isActiveMatch = Boolean(activeMatch && sameScriptAddress(activeMatch.address, address));
	const containsActiveMatch = Boolean(activeMatch && activeMatch.address.blockId === blockId && path.length < activeMatch.address.path.length && path.every((value, index) => activeMatch.address.path[index] === value));
	const select = (event: MouseEvent) => {
		event.stopPropagation();
		if ((event.target as HTMLElement).closest(".selectable-row")) return;
		onSelect(address, event.shiftKey);
	};
	const handleDrop = (event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		setDragOver(false);
		try { onDrop(address, JSON.parse(event.dataTransfer.getData("application/x-castorice-block")) as ScriptNodeAddress, isContainer); } catch { /* Ignore foreign drags. */ }
	};
	const startDrag = (event: DragEvent) => {
		event.stopPropagation();
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("application/x-castorice-block", JSON.stringify(address));
	};
	const dragHandle = <IconButton className="block-drag-handle" size="xs" draggable aria-label="拖动内容块" title="拖动内容块" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDragStart={startDrag}><IconGripVertical size={12} /></IconButton>;
	const dialogueText = node.type === "dialogue" ? String(node.text ?? "") : "";
	const annotations = dialogueText ? collectRubyAnnotations(dialogueText) : [];
	const dialogueCopyActions = node.type === "dialogue" ? <div className={`dialogue-copy-actions${annotations.length ? " has-annotations" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>{annotations.length ? <IconButton className="annotation-copy-button" size="xs" aria-label="复制本段全部注音" title="复制全部注音" onClick={() => void copyToClipboard(annotations.join(" "))}><IconLanguageHiragana size={11} /></IconButton> : null}<IconButton size="xs" aria-label="复制对话文本" title="复制对话文本" onClick={() => void copyToClipboard(plainRubyText(dialogueText))}><IconCopy size={11} /></IconButton></div> : null;
	const wrapperClass = `script-view-block script-level-${level} ${path.length ? "is-nested" : "is-root"} ${isContainer ? "is-container" : "is-leaf-block"} ${selected ? "is-selected" : ""} ${isActiveMatch ? "is-search-match" : ""} ${dragOver ? isContainer ? "is-drop-target" : "is-insert-target" : ""}`;

	if (isContainer) {
		const collapsed = Boolean(node.collapsed) && !containsActiveMatch;
		return <article id={scriptNodeDomId(address)} className={wrapperClass} data-level={level} data-search-active={isActiveMatch || undefined} onClick={select} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setDragOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }} onDrop={handleDrop}>
			<CollapsibleContent leadingActions={dragHandle} collapsed={collapsed} onCollapsedChange={(nextCollapsed) => onChange(path, { ...node, collapsed: nextCollapsed })} className={`${isMessageThread ? "read-node-message-thread" : "read-node-fold"} inline-edit-node`} depth={level - 1} heading={editable ? isMessageThread ? <MessageThreadHeadingFields node={node} content={content} onChange={(value) => onChange(path, value)} /> : <BufferedInput className="inline-heading-input" value={String(node.title ?? "")} placeholder="折叠组标题" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onValueChange={(value) => onChange(path, { ...node, title: value })} /> : <div className="container-heading-copy"><strong><HighlightedRichText text={String(node.title ?? (isMessageThread ? "未命名短信会话" : "未命名折叠组"))} highlight={isActiveMatch && activeMatch?.field === "title" ? activeMatch : undefined} /></strong>{isMessageThread ? <small>{String(node.subtitle ?? "") || "无副标题"} · 手机持有者：{String(node.owner ?? "开拓者")}</small> : null}</div>}>
				{content.map((child, index) => <ScriptHierarchyNode key={index} blockId={blockId} node={child} path={[...path, index]} level={level + 1} selectedAddresses={selectedAddresses} editableAddress={editableAddress} activeMatch={activeMatch} onSelect={onSelect} onChange={onChange} onDrop={onDrop} onDialogueCursor={onDialogueCursor} />)}
			</CollapsibleContent>
		</article>;
	}

	return <article id={scriptNodeDomId(address)} className={wrapperClass} data-level={level} data-search-active={isActiveMatch || undefined} onClick={select} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }} onDrop={handleDrop}>
		{dragHandle}
		{editable ? <EditableContent node={node} onChange={(value) => onChange(path, value)} onDialogueCursor={(offset) => onDialogueCursor(address, offset)} /> : <ReadOnlyContent node={node} path={path} selected={new Set()} highlight={isActiveMatch && activeMatch ? activeMatch : undefined} onToggle={(_path, _descendants, modifiers) => onSelect(address, Boolean(modifiers?.shiftKey))} />}
		{dialogueCopyActions}
	</article>;
}

export function ScriptBlockView({ block, selectedAddresses, editableAddress, activeMatch, onSelect, onChange, onDrop, onDialogueCursor }: Omit<ScriptHierarchyNodeProps, "blockId" | "node" | "path" | "level"> & { block: ScriptBlock }) {
	return <ScriptHierarchyNode blockId={block.id} node={block.node} path={[]} level={1} selectedAddresses={selectedAddresses} editableAddress={editableAddress} activeMatch={activeMatch} onSelect={onSelect} onChange={onChange} onDrop={onDrop} onDialogueCursor={onDialogueCursor} />;
}
