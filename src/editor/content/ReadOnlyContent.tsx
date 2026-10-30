import { useState, type MouseEvent } from "react";
import { InlineIconButton } from "../ui";
import { IconX } from "../ui/icons";
import { CollapsibleContent } from "./CollapsibleContent";
import { HighlightedRichText, InlineRubyText } from "./RichText";
import { nodeLabel, nodeSummary } from "./node-config";
import { descendantNodePaths, editorAssetUrl, imageDisplayStyle, pathKey, sourceNodeDomId } from "./tree";
import type { JsonNode, NodePath, ScriptTextMatch, SelectionModifiers } from "./types";

export interface ReadOnlyContentProps {
	node: JsonNode;
	path: NodePath;
	selected: Set<string>;
	onToggle: (path: NodePath, descendants?: NodePath[], modifiers?: SelectionModifiers) => void;
	depth?: number;
	highlight?: Pick<ScriptTextMatch, "field" | "start" | "end">;
}

export function ReadOnlyContent({ node, path, selected, onToggle, depth = 0, highlight }: ReadOnlyContentProps) {
	const [foldCollapsed, setFoldCollapsed] = useState(Boolean(node.collapsed));
	const type = String(node.type ?? "");
	const content = Array.isArray(node.content) ? node.content as JsonNode[] : [];
	const options = Array.isArray(node.options) ? node.options as JsonNode[] : [];
	const tabs = Array.isArray(node.tabs) ? node.tabs as JsonNode[] : [];
	const summary = nodeSummary(node);
	const assetUrl = editorAssetUrl(node.asset);
	const inlineImages: Array<Record<string, unknown> & { url: string }> = Array.isArray(node.images) ? (node.images as JsonNode[]).map((image) => ({ ...image, url: editorAssetUrl(image.asset) })).filter((image) => image.url) : [];
	const summaryField: ScriptTextMatch["field"] | null = typeof node.title === "string" ? "title" : typeof node.text === "string" ? "text" : typeof node.content === "string" ? "content" : null;
	const checked = selected.has(pathKey(path));
	const allDescendants = descendantNodePaths(node, path);
	const hasChildren = content.length > 0;
	const treeHasSelection = checked || allDescendants.some((descendant) => selected.has(pathKey(descendant)));
	const selectTree = allDescendants.length ? (event: MouseEvent) => { event.stopPropagation(); onToggle(path, allDescendants, { forceSelect: true }); } : undefined;
	const clearTree = allDescendants.length ? (event: MouseEvent) => { event.stopPropagation(); onToggle(path, allDescendants, { forceDeselect: true }); } : undefined;
	const clearButton = clearTree ? <InlineIconButton className="clear-tree-button" disabled={!treeHasSelection} label={`清除${nodeLabel(node)}及全部子项的选择`} onClick={clearTree} onDoubleClick={(event) => event.stopPropagation()}><IconX size={13} /></InlineIconButton> : null;

	if (type === "fold" || type === "message-thread") {
		const isMessageThread = type === "message-thread";
		return <CollapsibleContent collapsed={foldCollapsed} onCollapsedChange={setFoldCollapsed} className={`${isMessageThread ? "read-node-message-thread" : "read-node-fold"} ${checked ? "is-selected" : ""}`} depth={depth} headingClassName="selectable-row" onHeadingClick={(event) => onToggle(path, [], { shiftKey: event.shiftKey, additive: event.ctrlKey || event.metaKey })} onHeadingDoubleClick={selectTree} trailingActions={clearButton} heading={<div className="container-heading-copy"><strong><HighlightedRichText text={String(node.title ?? (isMessageThread ? "未命名短信" : "未命名折叠内容"))} highlight={highlight?.field === "title" ? highlight : undefined} /></strong>{isMessageThread ? <small>{String(node.subtitle ?? "") || "无副标题"} · 手机持有者：{String(node.owner ?? "开拓者")}</small> : null}</div>}>
			{content.map((child, index) => <ReadOnlyContent key={index} node={child} path={[...path, "content", index]} selected={selected} onToggle={onToggle} depth={depth + 1} />)}
		</CollapsibleContent>;
	}

	if (type === "choice") {
		return <div className="read-node read-node-choice choice-branches-only" data-depth={depth}><div className="read-choice-list">
			{options.map((option, optionIndex) => {
				const optionChildren = Array.isArray(option.content) ? option.content as JsonNode[] : [];
				const optionPath = [...path, "options", optionIndex] as NodePath;
				const optionDescendants = optionChildren.flatMap((child, childIndex) => { const childPath = [...optionPath, "content", childIndex] as NodePath; return [childPath, ...descendantNodePaths(child, childPath)]; });
				const optionChecked = selected.has(pathKey(optionPath));
				const optionTreeSelected = optionChecked || optionDescendants.some((descendant) => selected.has(pathKey(descendant)));
				return <section className={`read-choice-option ${optionChecked ? "is-selected" : ""}`} key={optionIndex}><header className="selectable-row" onClick={(event) => onToggle(optionPath, [], { shiftKey: event.shiftKey, additive: event.ctrlKey || event.metaKey })} onDoubleClick={(event) => { event.stopPropagation(); onToggle(optionPath, optionDescendants, { forceSelect: true }); }}><span>{optionIndex + 1}</span><strong><InlineRubyText text={String(option.text ?? "未命名选项")} /></strong><InlineIconButton className="clear-tree-button" disabled={!optionTreeSelected} label={`清除选项：${String(option.text ?? "未命名选项")}及全部回应的选择`} onClick={(event) => { event.stopPropagation(); onToggle(optionPath, optionDescendants, { forceDeselect: true }); }} onDoubleClick={(event) => event.stopPropagation()}><IconX size={13} /></InlineIconButton></header><div className="read-node-children">{optionChildren.map((child, childIndex) => <ReadOnlyContent key={childIndex} node={child} path={[...optionPath, "content", childIndex]} selected={selected} onToggle={onToggle} depth={depth + 1} />)}</div></section>;
			})}
		</div></div>;
	}

	if (type === "tabs") {
		return <div className={`read-node read-node-tabs ${checked ? "is-selected" : ""}`} data-depth={depth}><div className="read-node-heading selectable-row" onClick={(event) => onToggle(path, [], { shiftKey: event.shiftKey, additive: event.ctrlKey || event.metaKey })} onDoubleClick={selectTree}><strong>{tabs.length} 个条件分支</strong>{clearButton}</div><div className="read-choice-list">{tabs.map((tab, tabIndex) => { const tabChildren = Array.isArray(tab.content) ? tab.content as JsonNode[] : []; return <section className="read-choice-option tab-option" key={tabIndex}><header><span>{tabIndex + 1}</span><strong><InlineRubyText text={String(tab.title ?? "未命名分支")} /></strong><em>{tabChildren.length} 段内容</em></header><div className="read-node-children">{tabChildren.map((child, childIndex) => <ReadOnlyContent key={childIndex} node={child} path={[...path, "tabs", tabIndex, "content", childIndex]} selected={selected} onToggle={onToggle} depth={depth + 1} />)}</div></section>; })}</div></div>;
	}

	return <div className={`read-node read-node-${type || "unknown"} ${hasChildren ? "has-children" : "is-leaf"} ${checked ? "is-selected" : ""}`} data-depth={depth} data-side={typeof node.side === "string" ? node.side : undefined} data-tone={typeof node.tone === "string" ? node.tone : undefined}>
		<div className="read-node-line selectable-row" onClick={(event) => onToggle(path, [], { shiftKey: event.shiftKey, additive: event.ctrlKey || event.metaKey })} onDoubleClick={selectTree}>
			{type === "objective-description" && typeof node.location === "string" && node.location ? <strong className="read-objective-location"><InlineRubyText text={node.location} /></strong> : null}
			{typeof node.speaker === "string" && node.speaker ? <strong className="read-speaker"><InlineRubyText text={node.speaker} /></strong> : null}
			{inlineImages.length ? <span className="read-inline-media">{inlineImages.map((image, index) => <img key={`${String(image.file)}-${index}`} src={String(image.url)} alt={String(image.file ?? "剧情图片")} loading="lazy" style={imageDisplayStyle(image.displayWidth)} />)}</span> : null}
			{assetUrl ? <span className={`read-media ${node.contentType === "sticker" ? "is-sticker" : ""}`}><img src={assetUrl} alt={String(node.file ?? node.image ?? "剧情图片")} loading="lazy" style={imageDisplayStyle(node.displayWidth)} /></span> : <span className="read-text"><HighlightedRichText text={summary || (inlineImages.length ? "" : "—")} highlight={summaryField && highlight?.field === summaryField ? highlight : undefined} /></span>}
			{hasChildren ? clearButton : null}
		</div>
		{content.length ? <div className="read-node-children">{content.map((child, index) => <ReadOnlyContent key={index} node={child} path={[...path, "content", index]} selected={selected} onToggle={onToggle} depth={depth + 1} />)}</div> : null}
	</div>;
}

export function SourceContentCard(props: ReadOnlyContentProps) {
	return <div id={sourceNodeDomId(props.path)} className="source-card"><ReadOnlyContent {...props} /></div>;
}
