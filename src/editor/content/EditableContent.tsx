import type { MouseEvent, PointerEvent } from "react";
import { Button } from "../ui";
import { BufferedInput, BufferedTextarea } from "../ui/BufferedFields";
import { clone, newNodeTemplates, nodeSummary } from "./node-config";
import { normalizeMessageThreadContent } from "./screenplay-model";
import { editorAssetUrl, imageDisplayStyle } from "./tree";
import type { JsonNode } from "./types";

export interface EditableContentProps {
	node: JsonNode;
	onChange: (node: JsonNode) => void;
	onDialogueCursor?: (offset: number) => void;
	depth?: number;
}

export function EditableContent({ node, onChange, onDialogueCursor, depth = 0 }: EditableContentProps) {
	const type = String(node.type ?? "text");
	const content = Array.isArray(node.content) ? node.content as JsonNode[] : [];
	const tabs = Array.isArray(node.tabs) ? node.tabs as JsonNode[] : [];
	const set = (key: string, value: unknown) => onChange({ ...node, [key]: value });
	const updateChild = (index: number, child: JsonNode) => set("content", content.map((item, itemIndex) => itemIndex === index ? child : item));
	const stop = (event: MouseEvent | PointerEvent) => event.stopPropagation();
	const assetUrl = editorAssetUrl(node.asset);

	if (type === "fold") {
		return <div className="read-node read-node-fold inline-edit-node" data-depth={depth}><div className="read-node-heading"><BufferedInput className="inline-heading-input" value={String(node.title ?? "")} placeholder="折叠组标题" onPointerDown={stop} onClick={stop} onValueChange={(value) => set("title", value)} /></div><div className="read-node-children">{content.map((child, index) => <EditableContent key={index} node={child} depth={depth + 1} onChange={(value) => updateChild(index, value)} />)}<div className="inline-nested-actions" onPointerDown={stop} onClick={stop}><Button variant="outline" color="blue" size="xs" onClick={() => set("content", [...content, clone(newNodeTemplates.dialogue)])}>＋ 对话</Button><Button variant="outline" color="blue" size="xs" onClick={() => set("content", [...content, clone(newNodeTemplates.text)])}>＋ 文本</Button></div></div></div>;
	}

	if (type === "tabs") {
		return <div className="read-node read-node-tabs inline-edit-node" data-depth={depth}><div className="read-node-heading"><strong>{tabs.length} 个条件分支</strong></div><div className="read-choice-list">{tabs.map((tab, tabIndex) => { const children = Array.isArray(tab.content) ? tab.content as JsonNode[] : []; const updateTab = (value: JsonNode) => set("tabs", tabs.map((item, index) => index === tabIndex ? value : item)); return <section className="read-choice-option tab-option" key={tabIndex}><header><span>{tabIndex + 1}</span><BufferedInput className="inline-option-input" value={String(tab.title ?? "")} placeholder="分支标题" onPointerDown={stop} onClick={stop} onValueChange={(value) => updateTab({ ...tab, title: value })} /><em>{children.length} 段内容</em></header><div className="read-node-children">{children.map((child, childIndex) => <EditableContent key={childIndex} node={child} depth={depth + 1} onChange={(value) => updateTab({ ...tab, content: children.map((item, index) => index === childIndex ? value : item) })} />)}</div></section>; })}</div></div>;
	}

	const hasChildren = content.length > 0;
	const textualKey = typeof node.text === "string" ? "text" : typeof node.content === "string" ? "content" : null;
	return <div className={`read-node read-node-${type || "unknown"} ${hasChildren ? "has-children" : "is-leaf"} inline-edit-node`} data-depth={depth} data-side={typeof node.side === "string" ? node.side : undefined} data-tone={typeof node.tone === "string" ? node.tone : undefined}>
		<div className="read-node-line">
			{type === "objective-description" ? <BufferedInput className="inline-location-input" value={String(node.location ?? "")} placeholder="地点" onPointerDown={stop} onClick={stop} onValueChange={(value) => set("location", value)} /> : null}
			{type === "dialogue" || type === "message" ? <BufferedInput className="inline-speaker-input" style={{ width: `${Math.max(3, Array.from(String(node.speaker ?? "")).length)}em` }} value={String(node.speaker ?? "")} placeholder="说话人" onPointerDown={stop} onClick={stop} onValueChange={(value) => set("speaker", value)} /> : null}
			{type === "section" ? <span className="read-text inline-title-wrap"><BufferedInput className="inline-title-input" value={String(node.title ?? "")} placeholder="标题" onPointerDown={stop} onClick={stop} onValueChange={(value) => set("title", value)} /></span> : type === "message-thread-start" ? <div className="inline-thread-fields"><BufferedInput value={String(node.title ?? "")} placeholder="联系人" onPointerDown={stop} onClick={stop} onValueChange={(value) => set("title", value)} /><BufferedInput value={String(node.subtitle ?? "")} placeholder="签名" onPointerDown={stop} onClick={stop} onValueChange={(value) => set("subtitle", value)} /></div> : textualKey ? <BufferedTextarea className="inline-textarea" rows={1} value={String(node[textualKey] ?? "")} placeholder="内容" onPointerDown={stop} onClick={(event) => { stop(event); if (type === "dialogue") onDialogueCursor?.(event.currentTarget.selectionStart); }} onSelect={(event) => { if (type === "dialogue") onDialogueCursor?.(event.currentTarget.selectionStart); }} onKeyUp={(event) => { if (type === "dialogue") onDialogueCursor?.(event.currentTarget.selectionStart); }} onValueChange={(value) => set(textualKey, value)} /> : type === "image" ? assetUrl ? <span className="read-media editable-image-preview"><img src={assetUrl} alt={String(node.file ?? "剧情图片")} loading="lazy" style={imageDisplayStyle(node.displayWidth)} /><small>{String(node.file ?? "")}</small></span> : <span className="read-text image-missing">请选择图片</span> : <span className="read-text">{nodeSummary(node) || "—"}</span>}
		</div>
		{content.length ? <div className="read-node-children">{content.map((child, index) => <EditableContent key={index} node={child} depth={depth + 1} onChange={(value) => updateChild(index, value)} />)}</div> : null}
	</div>;
}

export function MessageThreadHeadingFields({ node, content, onChange }: { node: JsonNode; content: JsonNode[]; onChange: (node: JsonNode) => void }) {
	const stop = (event: MouseEvent | PointerEvent) => event.stopPropagation();
	return <div className="message-thread-heading-fields"><BufferedInput className="inline-heading-input" value={String(node.title ?? "")} placeholder="会话标题" onPointerDown={stop} onClick={stop} onValueChange={(value) => onChange({ ...node, title: value })} /><BufferedInput className="inline-thread-subtitle-input" value={String(node.subtitle ?? "")} placeholder="副标题（可选）" onPointerDown={stop} onClick={stop} onValueChange={(value) => onChange({ ...node, subtitle: value })} /><BufferedInput className="inline-thread-owner-input" value={String(node.owner ?? "")} placeholder="手机持有者" onPointerDown={stop} onClick={stop} onValueChange={(value) => onChange({ ...node, owner: value, content: normalizeMessageThreadContent(content, value) })} /></div>;
}
