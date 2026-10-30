import type { ReactNode } from "react";
import { IconButton } from "sityle";
import { BufferedInput } from "../ui/BufferedFields";
import { IconArrowLeft } from "../ui/icons";
import type { ScreenplayDocument } from "../content/types";

interface ScreenplayHeaderProps {
	document: ScreenplayDocument;
	activeFile: string;
	/** The buttons at the right end (the editor menu, the expand toggle). */
	actions: ReactNode;
	onBack: () => void;
	onTitleChange: (value: string) => void;
	onChapterChange: (value: string) => void;
}

/** The open screenplay, in two lines like the mission header beside it: file ・ chapter, then number and title. */
export function ScreenplayHeader({ document, activeFile, actions, onBack, onTitleChange, onChapterChange }: ScreenplayHeaderProps) {
	return <header className="script-header">
		<IconButton className="back-to-library" label="返回剧本库" onClick={onBack}><IconArrowLeft size={19} /></IconButton>
		<div className="script-heading">
			<div className="script-eyebrow"><span className="script-file">{activeFile}</span><span aria-hidden="true">・</span><BufferedInput className="chapter-input" aria-label="所属篇章" placeholder="所属篇章（可选）" value={document.chapter} onValueChange={onChapterChange} /></div>
			<div className="script-title-row"><strong>{document.id}</strong><BufferedInput className="title-input" aria-label="剧本标题" placeholder="剧本标题" value={document.title} onValueChange={onTitleChange} /></div>
		</div>
		<div className="script-header-actions">{actions}</div>
	</header>;
}
