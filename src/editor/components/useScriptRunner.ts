import { useCallback, useEffect, useRef, useState } from "react";

export interface EditorScript {
	id: string;
	label: string;
	description: string;
	confirm?: string;
}

export interface ScriptRun {
	id: string;
	output: string;
	exitCode: number | null;
}

type ScriptEvent = { type: "output"; text: string } | { type: "exit"; code: number };

const MAX_OUTPUT_LENGTH = 200_000;

// Lives in App (not the dialog) so a long-running script keeps streaming while the settings dialog is closed.
export function useScriptRunner(onFinished: (id: string, exitCode: number) => void) {
	const [scripts, setScripts] = useState<EditorScript[]>([]);
	const [run, setRun] = useState<ScriptRun | null>(null);
	const [running, setRunning] = useState(false);
	const onFinishedRef = useRef(onFinished);
	useEffect(() => { onFinishedRef.current = onFinished; });

	const loadScripts = useCallback(async () => {
		const response = await fetch("/editor-api/scripts");
		const payload = await response.json() as { scripts: EditorScript[] };
		setScripts(payload.scripts);
	}, []);

	const append = (text: string) => setRun((current) => current && { ...current, output: (current.output + text).slice(-MAX_OUTPUT_LENGTH) });

	const start = useCallback(async (script: EditorScript) => {
		if (script.confirm && !window.confirm(script.confirm)) return;
		setRunning(true);
		setRun({ id: script.id, output: "", exitCode: null });
		let exitCode = -1;
		try {
			const response = await fetch(`/editor-api/scripts/run?id=${encodeURIComponent(script.id)}`, { method: "POST" });
			if (!response.ok || !response.body) {
				const payload = await response.json().catch(() => ({})) as { error?: string };
				throw new Error(payload.error ?? `请求失败：${response.status}`);
			}
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = "";
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += value;
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (!line) continue;
					const event = JSON.parse(line) as ScriptEvent;
					if (event.type === "output") append(event.text);
					else exitCode = event.code;
				}
			}
		} catch (reason) {
			append(`\n${reason instanceof Error ? reason.message : String(reason)}\n`);
		} finally {
			setRun((current) => current && { ...current, exitCode });
			setRunning(false);
			onFinishedRef.current(script.id, exitCode);
		}
	}, []);

	const stop = useCallback(async () => { await fetch("/editor-api/scripts/stop", { method: "POST" }); }, []);
	const clear = useCallback(() => setRun(null), []);

	return { scripts, run, running, loadScripts, start, stop, clear };
}

export type ScriptRunner = ReturnType<typeof useScriptRunner>;
