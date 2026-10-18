import { Button, IconButton, MenuButton } from "../ui";
import { BufferedInput } from "../ui/BufferedFields";
import { IconArrowLeft } from "../ui/icons";
import type { ScreenplayDocument } from "../content/types";

interface ScreenplayMetaPanelProps {
	document: ScreenplayDocument;
	activeFile: string;
	onBack: () => void;
	onTitleChange: (value: string) => void;
	onChapterChange: (value: string) => void;
	onCharacterHiddenChange: (character: string, hidden: boolean) => void;
	onDelete: () => void;
}

function ScreenplayCharacterManager({ document, onCharacterHiddenChange }: Pick<ScreenplayMetaPanelProps, "document" | "onCharacterHiddenChange">) {
	return <div className="character-manager"><span>出场人物</span>{document.characters.visible.length ? document.characters.visible.map((character) => <Button key={character} size="xs" variant="light" color="blue" title="从人物列表中隐藏" onClick={() => onCharacterHiddenChange(character, true)}>{character}</Button>) : <em>未识别到对话角色</em>}{document.characters.hidden.length ? <MenuButton className="hidden-character-menu" size="xs" label={`已隐藏 ${document.characters.hidden.length}`} items={document.characters.hidden.map((character) => ({ label: `${character} · 恢复显示`, onClick: () => onCharacterHiddenChange(character, false) }))} /> : null}</div>;
}

export function ScreenplayMetaPanel({ document, activeFile, onBack, onTitleChange, onChapterChange, onCharacterHiddenChange, onDelete }: ScreenplayMetaPanelProps) {
	return <header className="script-header">
		<IconButton className="back-to-library" size="lg" aria-label="返回剧本列表" title="返回剧本列表" onClick={onBack}><IconArrowLeft size={19} /></IconButton>
		<div className="script-title-fields">
			<div className="script-title-row"><strong>{document.id}</strong><BufferedInput className="title-input" placeholder="剧本标题" value={document.title} onValueChange={onTitleChange} /></div>
			<BufferedInput className="chapter-input" placeholder="所属篇章（可选）" value={document.chapter} onValueChange={onChapterChange} />
			<ScreenplayCharacterManager document={document} onCharacterHiddenChange={onCharacterHiddenChange} />
		</div>
		<div className="file-actions"><span>{activeFile}</span><Button className="danger-text" variant="subtle" color="red" size="xs" onClick={onDelete}>删除剧本</Button></div>
	</header>;
}
