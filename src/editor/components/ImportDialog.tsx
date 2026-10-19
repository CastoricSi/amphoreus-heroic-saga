import { Button, Modal, SegmentedControl, Textarea } from "../ui";

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
	return <Modal opened={opened} onClose={onClose} title="批量导入内容" size="lg">
		<div className="text-import-dialog">
			<SegmentedControl value={mode} onChange={onModeChange} data={[{ value: "plain", label: "纯文本" }, { value: "source", label: "BWiki 源文" }, { value: "srt", label: "SRT 字幕" }]} />
			<Textarea data-autofocus rows={12} placeholder={mode === "plain" ? "在这里粘贴文本，每个非空行会生成一个内容块……" : mode === "srt" ? "粘贴包含序号、时间轴和字幕正文的 SRT 内容……" : "粘贴以 *角色：台词、{{剧情选项}}、{{任务描述}} 等组成的 BWiki 源文……"} value={text} onChange={(event) => onTextChange(event.target.value)} />
			{mode === "plain" ? <><p>自动忽略空行；导入为对话时，说话人默认为“？？？”。</p><div className="text-import-actions"><Button variant="light" disabled={!text.trim()} onClick={() => onImportPlain("narration")}>作为叙述导入</Button><Button disabled={!text.trim()} onClick={() => onImportPlain("dialogue")}>作为对话导入</Button></div></> : mode === "srt" ? <><p>自动移除字幕序号、时间轴和空行；每条字幕生成一个内容块。导入为对话时，说话人默认为“？？？”。</p><div className="text-import-actions"><Button variant="light" disabled={!text.trim()} onClick={() => onImportSrt("text")}>作为文本导入</Button><Button disabled={!text.trim()} onClick={() => onImportSrt("dialogue")}>作为对话导入</Button></div></> : <><p>自动识别对话、剧情选项、嵌套选项、章节标题、任务提示和常用文本模板。剧情选项会拆分为“开拓者”的对话及对应回应。</p><div className="text-import-actions"><Button loading={loading} disabled={!text.trim()} onClick={onImportSource}>解析并导入</Button></div></>}
		</div>
	</Modal>;
}
