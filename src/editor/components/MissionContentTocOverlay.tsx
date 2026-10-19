import { Button } from "../ui";
import type { NodePath } from "../content/types";
import { SideOverlay } from "./SideOverlay";

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
	return <SideOverlay opened={opened} title="任务内容目录" count={headings.length} className="mission-content-toc" onClose={onClose}>
		<p className="mission-content-toc-name">{missionName}</p>
		<nav>{headings.length ? headings.map((heading) => <Button key={JSON.stringify(heading.path)} variant="subtle" color="gray" size="sm" title={heading.title} onClick={() => { onOpen(heading); onClose(); }}>{heading.title}</Button>) : <p>当前任务没有三级标题</p>}</nav>
	</SideOverlay>;
}
