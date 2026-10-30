import { useEffect, useRef } from "react";
import { Button, Dialog, Segmented, TextArea } from "sityle";

export type ImportMode = "plain" | "source" | "srt";

interface ImportDialogProps {
	opened: boolean;
	mode: ImportMode;
	text: string;
	loading: boolean;
	onClose: () => void;
	onModeChange: (mode: ImportMode) => void;
	onTextChange: (text: string) => void;
	onImportPlain: (kind: "narration" | "dialogue") => void;
	onImportSrt: (kind: "text" | "dialogue") => void;
	onImportSource: () => void;
}

export function ImportDialog({ opened, mode, text, loading, onClose, onModeChange, onTextChange, onImportPlain, onImportSrt, onImportSource }: ImportDialogProps) {
	const field = useRef<HTMLTextAreaElement>(null);
	// The dialog focuses its first control (the format switch); the text box is where pasting happens.
	useEffect(() => {
		if (!opened) return;
		const timer = window.setTimeout(() => field.current?.focus(), 60);
		return () => window.clearTimeout(timer);
	}, [opened]);
	const empty = !text.trim();
	const actions = mode === "plain"
		? <><Button variant="flat" disabled={empty} onClick={() => onImportPlain("narration")}>作为叙述导入</Button><Button disabled={empty} onClick={() => onImportPlain("dialogue")}>作为对话导入</Button></>
		: mode === "srt"
		? <><Button variant="flat" disabled={empty} onClick={() => onImportSrt("text")}>作为文本导入</Button><Button disabled={empty} onClick={() => onImportSrt("dialogue")}>作为对话导入</Button></>
		: <Button loading={loading} disabled={empty} onClick={onImportSource}>解析并导入</Button>;
	return <Dialog open={opened} onClose={onClose} title="批量导入内容" wide className="editor-dialog is-lg" actions={actions}>
		<div className="text-import-dialog">
			<Segmented label="导入格式" value={mode} onChange={onModeChange} options={[{ value: "plain", label: "纯文本" }, { value: "source", label: "BWiki 源文" }, { value: "srt", label: "SRT 字幕" }]} />
			<TextArea ref={field} rows={12} aria-label="导入内容" placeholder={mode === "plain" ? "在这里粘贴文本，每个非空行会生成一个内容块……" : mode === "srt" ? "粘贴包含序号、时间轴和字幕正文的 SRT 内容……" : "粘贴以 *角色：台词、{{剧情选项}}、{{任务描述}} 等组成的 BWiki 源文……"} value={text} onChange={(event) => onTextChange(event.target.value)} />
			<p>{mode === "plain" ? "自动忽略空行；导入为对话时，说话人默认为“？？？”。" : mode === "srt" ? "自动移除字幕序号、时间轴和空行；每条字幕生成一个内容块。导入为对话时，说话人默认为“？？？”。" : "自动识别对话、剧情选项、嵌套选项、章节标题、任务提示和常用文本模板。剧情选项会拆分为“开拓者”的对话及对应回应。"}</p>
		</div>
	</Dialog>;
}
