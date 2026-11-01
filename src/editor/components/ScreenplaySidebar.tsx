import { Button, IconButton, Menu, NavItem, Tag } from "sityle";
import { IconChevronDown, IconX } from "../ui/icons";
import type { ScreenplayDocument, ScriptTitleEntry } from "../content/types";

interface ScreenplaySidebarProps {
	open: boolean;
	titles: ScriptTitleEntry[];
	isCurrent: (entry: ScriptTitleEntry) => boolean;
	characters: ScreenplayDocument["characters"];
	onOpenTitle: (entry: ScriptTitleEntry) => void;
	onCharacterHiddenChange: (character: string, hidden: boolean) => void;
}

/** Beside the screenplay: its section titles (jump to one) and the speakers it lists. */
export function ScreenplaySidebar({ open, titles, isCurrent, characters, onOpenTitle, onCharacterHiddenChange }: ScreenplaySidebarProps) {
	return <aside className="script-sidebar" aria-label="剧本目录与人物" aria-hidden={!open} inert={!open || undefined}>
		<section className="sidebar-section is-toc">
			<header className="sidebar-heading"><h2>章节目录</h2><small>{titles.length} 节</small></header>
			<nav className="sidebar-toc">{titles.length
				? titles.map((entry) => <NavItem wrap key={`${entry.blockId}-${entry.path.join("-")}`} current={isCurrent(entry)} style={{ paddingLeft: `${10 + Math.min(entry.depth, 4) * 12}px` }} onClick={() => onOpenTitle(entry)} title={entry.title} label={entry.title} />)
				: <p>还没有章节标题</p>}</nav>
		</section>
		<section className="sidebar-section is-characters">
			<header className="sidebar-heading"><h2>出场人物</h2>{characters.hidden.length
				? <Menu label="已隐藏的人物" align="end" trigger={(props) => <Button {...props} variant="ghost" size="sm" className="hidden-character-menu">已隐藏 {characters.hidden.length}<IconChevronDown size={12} /></Button>} items={characters.hidden.map((character) => ({ label: `恢复显示 ${character}`, textValue: character, onSelect: () => onCharacterHiddenChange(character, false) }))} />
				: <small>{characters.visible.length} 人</small>}</header>
			<div className="character-list">{characters.visible.length
				? characters.visible.map((character) => <Tag key={character} tone="azure" className="character-chip">{character}<IconButton className="character-hide" label={`从人物列表中隐藏 ${character}`} onClick={() => onCharacterHiddenChange(character, true)}><IconX /></IconButton></Tag>)
				: <p>还没有识别到对话角色</p>}</div>
		</section>
	</aside>;
}
