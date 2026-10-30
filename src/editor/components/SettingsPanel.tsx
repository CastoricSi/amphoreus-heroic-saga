import { useEffect, useRef, useState } from "react";
import { Button } from "sityle";
import { IconPlayerPlay, IconPlayerStop } from "../ui/icons";
import type { ScriptRunner } from "./useScriptRunner";

interface EditorStats {
	missions: number;
	categories: Array<{ name: string; missions: number }>;
	series: number;
	locations: number;
	screenplays: number;
	screenplayCharacters: number;
	images: number;
	indexFetchedAt: string | null;
}

interface SettingsPanelProps {
	runner: ScriptRunner;
}

const numberFormat = new Intl.NumberFormat("zh-CN");

function relativeTime(iso: string) {
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时前`;
	return `${Math.round(minutes / (60 * 24))} 天前`;
}

function fullTime(iso: string) {
	return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
	return <div className="dash-card stat-card"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></div>;
}

/** Overview of the local data plus the data scripts, shown in the settings dialog. */
export function SettingsPanel({ runner }: SettingsPanelProps) {
	const { scripts, run, running, loadScripts, start, stop, clear } = runner;
	const outputRef = useRef<HTMLPreElement>(null);
	const [stats, setStats] = useState<EditorStats | null>(null);
	const activeScript = run ? scripts.find((script) => script.id === run.id) : undefined;

	// Reloaded on open and again after a data script finishes successfully, since that changes the numbers.
	const statsKey = run?.exitCode === 0 ? `${run.id}:done` : "base";

	useEffect(() => { void loadScripts(); }, [loadScripts]);
	useEffect(() => {
		let cancelled = false;
		void fetch("/editor-api/stats").then((response) => response.ok ? response.json() as Promise<EditorStats> : null).then((data) => { if (!cancelled && data) setStats(data); });
		return () => { cancelled = true; };
	}, [statsKey]);
	useEffect(() => {
		const element = outputRef.current;
		if (element) element.scrollTop = element.scrollHeight;
	}, [run?.output]);

	return <div className="settings-panel">
		<section className="dash-section">
			<h3>数据概览</h3>
			<div className="stat-grid">
				<StatCard label="任务" value={stats ? numberFormat.format(stats.missions) : "—"} detail={stats ? `${stats.series} 个系列 · ${stats.locations} 个地点` : "读取中…"} />
				<StatCard label="剧本" value={stats ? numberFormat.format(stats.screenplays) : "—"} detail={stats ? `共 ${numberFormat.format(stats.screenplayCharacters)} 字` : "读取中…"} />
				<StatCard label="图片" value={stats ? numberFormat.format(stats.images) : "—"} detail="已下载到本地" />
				<StatCard label="数据更新" value={stats?.indexFetchedAt ? relativeTime(stats.indexFetchedAt) : "—"} detail={stats?.indexFetchedAt ? fullTime(stats.indexFetchedAt) : "尚未抓取任务索引"} />
			</div>
			{stats?.categories.length ? <div className="dash-card category-card">
				<span className="stat-label">任务分类</span>
				<ul>{stats.categories.map((category) => <li key={category.name}><span>{category.name}</span><strong>{numberFormat.format(category.missions)}</strong></li>)}</ul>
			</div> : null}
		</section>
		<section className="dash-section">
			<h3>数据工具</h3>
			<ul className="script-list">{scripts.map((script) => <li key={script.id} className="dash-card">
				<div><strong>{script.label}</strong><p>{script.description}</p></div>
				{running && run?.id === script.id
					? <Button variant="flat" tone="danger" size="sm" icon={<IconPlayerStop />} onClick={() => void stop()}>停止</Button>
					: <Button variant="flat" size="sm" icon={<IconPlayerPlay />} disabled={running} onClick={() => void start(script)}>运行</Button>}
			</li>)}</ul>
			{run ? <div className="dash-card script-output">
				<header>
					<strong>{activeScript?.label ?? run.id}</strong>
					<span className={`script-output-status ${run.exitCode === null ? "is-running" : run.exitCode === 0 ? "is-success" : "is-error"}`}>{run.exitCode === null ? "运行中…" : run.exitCode === 0 ? "已完成" : `失败（退出代码 ${run.exitCode}）`}</span>
					<Button variant="ghost" size="sm" disabled={running} onClick={clear}>清除输出</Button>
				</header>
				<pre ref={outputRef}>{run.output || (run.exitCode === null ? "等待输出…" : "（无输出）")}</pre>
			</div> : null}
		</section>
	</div>;
}
