import { Menu, NavItem, IconButton } from "sityle";
import { IconListTree } from "../ui/icons";
import { pathKey } from "../content/tree";
import type { NodePath } from "../content/types";

export interface MissionContentHeading {
	title: string;
	path: NodePath;
}

interface MissionTocProps {
	headings: MissionContentHeading[];
	/** pathKey of the heading the reader is in (follows scrolling), or null above the first one. */
	active: string | null;
	onOpen: (heading: MissionContentHeading) => void;
}

/** The open mission's table of contents as a column beside its content (wide viewer). */
export function MissionTocColumn({ headings, active, onOpen }: MissionTocProps) {
	return <nav className="viewer-toc" aria-label="任务内容目录">
		<header className="viewer-column-header"><h2>目录</h2><small>{headings.length} 节</small></header>
		<div className="viewer-toc-list">{headings.length
			? headings.map((heading) => <NavItem wrap key={pathKey(heading.path)} current={active === pathKey(heading.path)} title={heading.title} label={heading.title} onClick={() => onOpen(heading)} />)
			: <p>这个任务没有分节标题</p>}</div>
	</nav>;
}

/** The same table of contents as a menu from the mission header (narrower viewer). */
export function MissionTocMenu({ headings, onOpen }: Omit<MissionTocProps, "active">) {
	if (!headings.length) return null;
	return <Menu label="任务内容目录" align="end" className="mission-toc-menu" trigger={(props) => <IconButton {...props} label="任务内容目录"><IconListTree /></IconButton>} items={headings.map((heading) => ({ label: heading.title, textValue: heading.title, onSelect: () => onOpen(heading) }))} />;
}
