import { Badge, Button, IconButton } from "../ui";
import { IconX } from "../ui/icons";
import type { NodePath } from "../content/types";

export interface MissionContentHeading {
	title: string;
	path: NodePath;
}

interface MissionContentTocOverlayProps {
	opened: boolean;
	missionName: string;
	headings: MissionContentHeading[];
	onClose: () => void;
	onOpen: (heading: MissionContentHeading) => void;
}

export function MissionContentTocOverlay({ opened, missionName, headings, onClose, onOpen }: MissionContentTocOverlayProps) {
	if (!opened) return null;
	return <div className="mission-toc-backdrop" onClick={onClose}>
		<aside className="mission-toc-overlay mission-content-toc-overlay" role="dialog" aria-label="当前任务内容目录" onClick={(event) => event.stopPropagation()}>
			<header><div><strong>任务内容目录</strong><Badge color="blue" size="xs">{headings.length}</Badge></div><IconButton aria-label="关闭内容目录" size="sm" onClick={onClose}><IconX /></IconButton></header>
			<p className="mission-content-toc-name">{missionName}</p>
			<nav>{headings.length ? headings.map((heading) => <Button key={JSON.stringify(heading.path)} variant="subtle" color="gray" size="sm" title={heading.title} onClick={() => { onOpen(heading); onClose(); }}>{heading.title}</Button>) : <p>当前任务没有三级标题</p>}</nav>
		</aside>
	</div>;
}
