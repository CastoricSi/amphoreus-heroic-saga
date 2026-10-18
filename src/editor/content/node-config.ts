import type { JsonNode } from "./types";

export const nodeLabels: Record<string, string> = {
	dialogue: "对话",
	narration: "叙述",
	section: "章节标题",
	choice: "剧情选项",
	divider: "分隔线",
	fold: "折叠组",
	"message-thread": "短信会话",
	"objective-description": "任务提示",
	message: "短信消息",
	"message-thread-start": "短信开始",
	"message-thread-end": "短信结束",
	"message-system": "短信系统提示",
	text: "普通文本",
	notice: "提示文本",
	note: "编辑注释",
	image: "图片",
	tabs: "条件分支",
	spoiler: "隐藏文本",
	annotation: "标注文本",
	"list-item": "列表项",
	event: "事件文本",
	style: "样式文本",
};

export const newNodeTemplates: Record<string, JsonNode> = {
	dialogue: { type: "dialogue", speaker: "", text: "" },
	narration: { type: "narration", text: "" },
	section: { type: "section", level: 2, title: "新章节" },
	choice: { type: "choice", presentation: "dialogue", options: [{ id: 1, text: "新选项", content: [] }] },
	divider: { type: "divider" },
	note: { type: "note", text: "" },
	text: { type: "text", text: "" },
	image: { type: "image", file: "", asset: "" },
};

export function nodeLabel(node: JsonNode) {
	return nodeLabels[String(node.type ?? "")] ?? String(node.type ?? "未知类型");
}

export function nodeSummary(node: JsonNode) {
	if (typeof node.title === "string") return node.title;
	if (typeof node.text === "string") return node.text;
	if (typeof node.content === "string") return node.content;
	if (node.type === "choice" && Array.isArray(node.options)) return `${node.options.length} 个选项`;
	if (node.type === "tabs" && Array.isArray(node.tabs)) return `${node.tabs.length} 个条件分支`;
	if (node.type === "fold" && Array.isArray(node.content)) return `${node.content.length} 段折叠内容`;
	if (node.type === "message-thread" && Array.isArray(node.content)) return `${node.content.length} 条短信`;
	if (typeof node.file === "string") return node.file;
	return "";
}

export function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
