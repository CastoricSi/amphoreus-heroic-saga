import { useEffect, useRef } from "react";
import { Button, Modal } from "../ui";
import { IconPlayerPlay, IconPlayerStop } from "../ui/icons";
import type { ScriptRunner } from "./useScriptRunner";

interface SettingsDialogProps {
	opened: boolean;
	runner: ScriptRunner;
	onClose: () => void;
}

export function SettingsDialog({ opened, runner, onClose }: SettingsDialogProps) {
	const { scripts, run, running, loadScripts, start, stop, clear } = runner;
	const outputRef = useRef<HTMLPreElement>(null);
	const activeScript = run ? scripts.find((script) => script.id === run.id) : undefined;

	useEffect(() => { if (opened) void loadScripts(); }, [opened, loadScripts]);
	useEffect(() => {
		const element = outputRef.current;
		if (element) element.scrollTop = element.scrollHeight;
	}, [run?.output, opened]);

	return <Modal opened={opened} onClose={onClose} title="设置" size="lg">
		<div className="settings-dialog">
			<section className="settings-section">
				<h3>数据脚本</h3>
				<ul className="script-list">{scripts.map((script) => <li key={script.id}>
					<div><strong>{script.label}</strong><p>{script.description}</p></div>
					{running && run?.id === script.id
						? <Button variant="light" color="red" size="sm" icon={<IconPlayerStop />} onClick={() => void stop()}>停止</Button>
						: <Button variant="light" color="blue" size="sm" icon={<IconPlayerPlay />} disabled={running} onClick={() => void start(script)}>运行</Button>}
				</li>)}</ul>
			</section>
			{run ? <section className="settings-section script-output">
				<header>
					<h3>{activeScript?.label ?? run.id}</h3>
					<span className={`script-output-status ${run.exitCode === null ? "is-running" : run.exitCode === 0 ? "is-success" : "is-error"}`}>{run.exitCode === null ? "运行中…" : run.exitCode === 0 ? "已完成" : `失败（退出代码 ${run.exitCode}）`}</span>
					<Button variant="subtle" color="gray" size="xs" disabled={running} onClick={clear}>清除输出</Button>
				</header>
				<pre ref={outputRef}>{run.output || (run.exitCode === null ? "等待输出…" : "（无输出）")}</pre>
			</section> : null}
		</div>
	</Modal>;
}
