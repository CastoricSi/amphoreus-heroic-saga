import type { DragEvent } from "react";
import { Badge, Button, InteractiveSurface } from "../ui";
import { IconGripVertical, IconPlus } from "../ui/icons";
import type { ScreenplaySummary } from "../content/types";

interface ScreenplayLibraryProps {
	screenplays: ScreenplaySummary[];
	draggedName: string | null;
	onCreate: () => void;
	onOpen: (name: string) => void;
	onDragStart: (name: string) => void;
	onDragEnd: () => void;
	onReorder: (from: string, to: string) => void;
}

export function ScreenplayLibrary({ screenplays, draggedName, onCreate, onOpen, onDragStart, onDragEnd, onReorder }: ScreenplayLibraryProps) {
	const drop = (event: DragEvent, target: string) => { event.preventDefault(); const from = draggedName ?? event.dataTransfer.getData("text/plain"); if (from) onReorder(from, target); };
	return <div className="screenplay-library">
		<header className="screenplay-library-header"><h2>剧本库</h2><div className="screenplay-library-actions"><Badge color="blue" size="lg">{screenplays.length} 个剧本</Badge><Button icon={<IconPlus size={14} />} onClick={onCreate}>新建剧本</Button></div></header>
		<div className="screenplay-list">{screenplays.length ? screenplays.map((item) => <InteractiveSurface className={`screenplay-list-item ${draggedName === item.name ? "is-dragging" : ""}`} key={item.name} draggable onDragStart={(event) => { onDragStart(item.name); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.name); }} onDragEnd={onDragEnd} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => drop(event, item.name)} onActivate={() => onOpen(item.name)}><IconGripVertical className="screenplay-list-grip" size={16} /><strong><b>{item.id || "---"}</b> {item.title || "未命名剧本"}</strong><small className="screenplay-chapter">{item.chapter || "未设置篇章"}</small><small className="screenplay-characters">{item.characters.length ? item.characters.join(" · ") : "暂无出场人物"}</small><div className="screenplay-list-metrics"><span>{item.characterCount.toLocaleString()} 字</span></div></InteractiveSurface>) : <div className="empty-script"><span>✦</span><h3>还没有剧本</h3><p>点击右上角“新建剧本”开始创作。</p></div>}</div>
	</div>;
}
