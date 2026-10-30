import { Button, IconButton, Menu } from "sityle";
import { BufferedInput } from "../ui/BufferedFields";
import { IconArrowLeft, IconChevronDown, IconX } from "../ui/icons";
import type { ScreenplayDocument } from "../content/types";

interface ScreenplayMetaPanelProps {
	document: ScreenplayDocument;
	characters: ScreenplayDocument["characters"];
	activeFile: string;
	onBack: () => void;
	onTitleChange: (value: string) => void;
	onChapterChange: (value: string) => void;
	onCharacterHiddenChange: (character: string, hidden: boolean) => void;
	onDelete: () => void;
}

function ScreenplayCharacterManager({ characters, onCharacterHiddenChange }: Pick<ScreenplayMetaPanelProps, "characters" | "onCharacterHiddenChange">) {
	return <div className="character-manager"><span>出场人物</span>{characters.visible.length ? characters.visible.map((character) => <span key={character} className="character-chip">{character}<button type="button" aria-label={`从人物列表中隐藏 ${character}`} title="从人物列表中隐藏" onClick={() => onCharacterHiddenChange(character, true)}><IconX size={10} /></button></span>) : <em>未识别到对话角色</em>}{characters.hidden.length ? <Menu label="已隐藏的人物" trigger={(props) => <button {...props} type="button" className="hidden-character-menu">已隐藏 {characters.hidden.length}<IconChevronDown size={11} /></button>} items={characters.hidden.map((character) => ({ label: `${character} · 恢复显示`, onSelect: () => onCharacterHiddenChange(character, false) }))} /> : null}</div>;
}

export function ScreenplayMetaPanel({ document, characters, activeFile, onBack, onTitleChange, onChapterChange, onCharacterHiddenChange, onDelete }: ScreenplayMetaPanelProps) {
	return <header className="script-header">
		<IconButton className="back-to-library" label="返回剧本列表" onClick={onBack}><IconArrowLeft size={19} /></IconButton>
		<div className="script-title-fields">
			<div className="script-title-row"><strong>{document.id}</strong><BufferedInput className="title-input" aria-label="剧本标题" placeholder="剧本标题" value={document.title} onValueChange={onTitleChange} /></div>
			<BufferedInput className="chapter-input" aria-label="所属篇章" placeholder="所属篇章（可选）" value={document.chapter} onValueChange={onChapterChange} />
			<ScreenplayCharacterManager characters={characters} onCharacterHiddenChange={onCharacterHiddenChange} />
		</div>
		<div className="file-actions"><span>{activeFile}</span><Menu label="剧本操作" align="end" trigger={(props) => <Button {...props} variant="ghost" size="sm">更多<IconChevronDown size={13} /></Button>} items={[{ label: "删除剧本…", danger: true, onSelect: onDelete }]} /></div>
	</header>;
}
