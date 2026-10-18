import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, IconButton, MenuButton, NavLink, Select, TextInput, Tooltip } from "./ui";
import { IconBooks, IconListTree, IconMapPin, IconSearch } from "./ui/icons";
import { clone, newNodeTemplates, nodeLabel } from "./content/node-config";
import { SourceContentCard } from "./content/ReadOnlyContent";
import { ScriptBlockView } from "./content/ScriptBlockView";
import { adjustTargetPathAfterRemoval, collectNodePaths, collectScriptTextMatches, expandChoiceOption, expandDialogueChoices, findMessageOwner, flattenMissions, groupLegacyMessageThreadNodes, isAncestorPath, isNumberPathAncestor, nestedNodeAtPath, nodeAtPath, normalizeMessageThreads, normalizeScriptBlocks, removeNestedNode, replaceDialogueSpeaker, sameNumberPath, sameScriptAddress, scriptNodeDomId, scriptSiblingGroup, syncScreenplayCharacters, toMessageThread, updateNestedNode } from "./content/screenplay-model";
import { pathKey, sourceNodeDomId } from "./content/tree";
import type { BootstrapResponse, CutScriptBlock, ImageAsset, JsonNode, MissionDocument, MissionIndex, MissionRef, NodePath, ScreenplayDocument, ScreenplaySummary, ScriptBlock, ScriptNodeAddress, ScriptTextMatch, ScriptTitleEntry, SearchMode, SelectionModifiers } from "./content/types";
import { ImagePickerDialog } from "./components/ImagePickerDialog";
import { ImportDialog, type ImportMode } from "./components/ImportDialog";
import { MissionContentTocOverlay, type MissionContentHeading } from "./components/MissionContentTocOverlay";
import { MissionPager } from "./components/MissionPager";
import { MissionTocOverlay } from "./components/MissionTocOverlay";
import { ScreenplayLibrary } from "./components/ScreenplayLibrary";
import { ScreenplayMetaPanel } from "./components/ScreenplayMetaPanel";
import "./content/content.css";
import "./App.css";

const AUTO_SAVE_INTERVAL_MS = 10_000;


function collectScriptTitles(blocks: ScriptBlock[]) {
	const entries: ScriptTitleEntry[] = [];
	const visit = (blockId: string, node: JsonNode, path: number[]) => {
		if (node.type === "section") entries.push({ blockId, path, title: String(node.title ?? "未命名标题"), depth: path.length });
		if (Array.isArray(node.content)) (node.content as JsonNode[]).forEach((child, index) => visit(blockId, child, [...path, index]));
	};
	blocks.forEach((block) => visit(block.id, block.node, []));
	return entries;
}

function collectMissionHeadings(content: JsonNode[]) {
	return content.flatMap((node, index) => node.type === "section" && Number(node.level ?? 3) === 3
		? [{ title: String(node.title ?? "未命名标题"), path: [index] as NodePath }]
		: []);
}

function scriptBlockSourceLabel(block: ScriptBlock, nodePath: number[]) {
	if (!block.source) return "自定义内容";
	const originalPath = block.source.contentPath?.length ? `.${block.source.contentPath.join(".")}` : "";
	const currentPath = nodePath.length ? ` · 当前层级：${nodePath.join(".")}` : "";
	return `任务：${block.source.mission} · 文件：data/${block.source.dataFile} · 原始位置：content[${block.source.contentIndex}]${originalPath}${currentPath}`;
}

function expandFoldsAlongPath(root: JsonNode, path: number[]): JsonNode {
	if (!path.length) return root;
	const content = Array.isArray(root.content) ? root.content as JsonNode[] : [];
	const [index, ...rest] = path;
	if (!content[index]) return root;
	const child: JsonNode = expandFoldsAlongPath(content[index], rest);
	const expandedRoot = (root.type === "fold" || root.type === "message-thread") && root.collapsed ? { ...root, collapsed: false } : root;
	if (child === content[index]) return expandedRoot;
	return { ...expandedRoot, content: content.map((item, itemIndex) => itemIndex === index ? child : item) };
}

function parseSrtEntries(source: string) {
	return source
		.replace(/^\uFEFF/u, "")
		.trim()
		.split(/\r?\n\s*\r?\n/u)
		.map((entry) => {
			const lines = entry.split(/\r?\n/u).map((line) => line.trim());
			if (/^\d+$/u.test(lines[0] ?? "")) lines.shift();
			const timelineIndex = lines.findIndex((line) => /^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/u.test(line));
			if (timelineIndex >= 0) lines.splice(0, timelineIndex + 1);
			return lines.filter(Boolean).join("\n").trim();
		})
		.filter(Boolean);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const payload = (await response.json()) as T & { error?: string };
	if (!response.ok) throw new Error(payload.error ?? `请求失败：${response.status}`);
	return payload;
}

function App() {
	const [index, setIndex] = useState<MissionIndex>({});
	const [screenplays, setScreenplays] = useState<ScreenplaySummary[]>([]);
	const [missionFilter, setMissionFilter] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("开拓任务");
	const [locationFilter, setLocationFilter] = useState("");
	const [selectedMission, setSelectedMission] = useState<MissionRef | null>(null);
	const [missionDocument, setMissionDocument] = useState<MissionDocument | null>(null);
	const [selectedSource, setSelectedSource] = useState<Set<string>>(new Set());
	const [activeFile, setActiveFile] = useState("");
	const [document, setDocument] = useState<ScreenplayDocument | null>(null);
	const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
	const [selectedNodePath, setSelectedNodePath] = useState<number[]>([]);
	const [multiSelectMode, setMultiSelectMode] = useState(false);
	const [multiSelected, setMultiSelected] = useState<ScriptNodeAddress[]>([]);
	const [dialogueCursor, setDialogueCursor] = useState<{ address: ScriptNodeAddress; offset: number } | null>(null);
	const [draggedScreenplay, setDraggedScreenplay] = useState<string | null>(null);
	const [importOpened, setImportOpened] = useState(false);
	const [importText, setImportText] = useState("");
	const [importMode, setImportMode] = useState<ImportMode>("plain");
	const [importLoading, setImportLoading] = useState(false);
	const [imagePickerMode, setImagePickerMode] = useState<"add" | "replace" | null>(null);
	const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
	const [imageSearch, setImageSearch] = useState("");
	const [imageLoading, setImageLoading] = useState(false);
	const [searchMode, setSearchMode] = useState<SearchMode | null>(null);
	const [searchMatches, setSearchMatches] = useState<ScriptTextMatch[]>([]);
	const [searchMatchIndex, setSearchMatchIndex] = useState(0);
	const [editorFocusMode, setEditorFocusMode] = useState(false);
	const [missionTocOpen, setMissionTocOpen] = useState(false);
	const [missionContentTocOpen, setMissionContentTocOpen] = useState(false);
	const [titleNavigatorOpen, setTitleNavigatorOpen] = useState(true);
	const [dirty, setDirty] = useState(false);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
	const [error, setError] = useState("");
	const revision = useRef(0);
	const documentRef = useRef<ScreenplayDocument | null>(null);
	const activeFileRef = useRef("");
	const dirtyRef = useRef(false);
	const savePromiseRef = useRef<Promise<boolean> | null>(null);
	const dialogueCursorRef = useRef<{ address: ScriptNodeAddress; offset: number } | null>(null);
	const cutBlocksRef = useRef<CutScriptBlock[]>([]);
	const cutSelectionActionRef = useRef<() => boolean>(() => false);
	const pasteSelectionActionRef = useRef<() => boolean>(() => false);
	const splitDialogueActionRef = useRef<() => boolean>(() => false);
	const selectionAnchor = useRef<string | null>(null);
	const multiSelectionChanged = useRef(false);
	const scriptSelectionAnchor = useRef<ScriptNodeAddress | null>(null);
	const missions = useMemo(() => flattenMissions(index), [index]);
	const missionCategories = useMemo(() => Object.keys(index), [index]);
	const missionLocations = useMemo(() => [...new Set(missions.filter((mission) => !categoryFilter || mission.category === categoryFilter).map((mission) => mission.location))], [categoryFilter, missions]);
	const sourcePaths = useMemo(() => missionDocument ? collectNodePaths(missionDocument.content) : [], [missionDocument]);
	const missionHeadings = useMemo(() => missionDocument ? collectMissionHeadings(missionDocument.content) : [], [missionDocument]);
	const scriptTitles = useMemo(() => document ? collectScriptTitles(document.blocks) : [], [document]);
	const filteredMissions = useMemo(() => {
		const needle = missionFilter.trim().toLowerCase();
		return missions.filter((mission) => {
			if (categoryFilter && mission.category !== categoryFilter) return false;
			if (locationFilter && mission.location !== locationFilter) return false;
			return !needle || [mission.name, mission.series, mission.location, mission.category].join(" ").toLowerCase().includes(needle);
		});
	}, [categoryFilter, locationFilter, missionFilter, missions]);
	const missionGroups = useMemo(() => {
		const locations = new Map<string, Map<string, MissionRef[]>>();
		for (const mission of filteredMissions) {
			if (!locations.has(mission.location)) locations.set(mission.location, new Map());
			const series = locations.get(mission.location)!;
			if (!series.has(mission.series)) series.set(mission.series, []);
			series.get(mission.series)!.push(mission);
		}
		return [...locations].map(([location, series]) => ({
			location,
			series: [...series].map(([name, entries]) => ({ name, entries })),
		}));
	}, [filteredMissions]);
	const selectedMissionPosition = selectedMission ? filteredMissions.findIndex((mission) => mission.dataFile === selectedMission.dataFile) : -1;
	const previousMission = selectedMissionPosition > 0 ? filteredMissions[selectedMissionPosition - 1] : null;
	const nextMission = selectedMissionPosition >= 0 && selectedMissionPosition < filteredMissions.length - 1 ? filteredMissions[selectedMissionPosition + 1] : null;
	const selectedBlockIndex = document && selectedBlockId ? document.blocks.findIndex((block) => block.id === selectedBlockId) : -1;
	const selectedBlock = selectedBlockIndex >= 0 && document ? document.blocks[selectedBlockIndex] : null;
	const selectedNode = selectedBlock ? nestedNodeAtPath(selectedBlock.node, selectedNodePath) : null;
	const selectedSourceMission = selectedBlock?.source ? missions.find((mission) => mission.dataFile === selectedBlock.source?.dataFile) ?? null : null;
	const filteredImageAssets = useMemo(() => {
		const needle = imageSearch.trim().toLowerCase();
		return needle ? imageAssets.filter((image) => image.file.toLowerCase().includes(needle)) : imageAssets;
	}, [imageAssets, imageSearch]);
	const activeScriptSelection = multiSelectMode ? multiSelected : selectedBlockId ? [{ blockId: selectedBlockId, path: selectedNodePath }] : [];
	const editableAddress = !multiSelectMode && selectedBlockId ? { blockId: selectedBlockId, path: selectedNodePath } : null;
	const canFoldSelection = activeScriptSelection.length > 1 && activeScriptSelection.every((address) => scriptSiblingGroup(address) === scriptSiblingGroup(activeScriptSelection[0]));
	const mergeCandidates = document ? activeScriptSelection.map((address) => {
		const blockIndex = document.blocks.findIndex((block) => block.id === address.blockId);
		const block = document.blocks[blockIndex];
		return { address, node: block ? nestedNodeAtPath(block.node, address.path) : null, index: address.path.length ? address.path.at(-1)! : blockIndex };
	}) : [];
	const mergeIndexes = mergeCandidates.map((candidate) => candidate.index).sort((left, right) => left - right);
	const canMergeDialogues = canFoldSelection
		&& mergeCandidates.length > 1
		&& mergeCandidates.every((candidate) => candidate.node?.type === "dialogue" && candidate.node.speaker === mergeCandidates[0].node?.speaker)
		&& mergeIndexes.every((index, offset) => index === mergeIndexes[0] + offset);
	const canSplitDialogue = Boolean(selectedBlock && selectedNode?.type === "dialogue" && dialogueCursor && dialogueCursor.address.blockId === selectedBlock.id && sameNumberPath(dialogueCursor.address.path, selectedNodePath));
	const normalizedSearchIndex = searchMatches.length ? ((searchMatchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length : 0;
	const activeSearchMatch = searchMatches[normalizedSearchIndex] ?? null;
	documentRef.current = document;
	activeFileRef.current = activeFile;
	dirtyRef.current = dirty;

	const saveCurrentDocument = useCallback(async (): Promise<boolean> => {
		if (savePromiseRef.current) await savePromiseRef.current;
		const pending = documentRef.current;
		const file = activeFileRef.current;
		if (!pending || !file || !dirtyRef.current) return true;
		const current = syncScreenplayCharacters(pending);
		documentRef.current = current;
		const capturedRevision = revision.current;
		const task = (async () => {
			setSaveState("saving");
			try {
				const saved = await requestJson<ScreenplayDocument>(`/editor-api/screenplay?name=${encodeURIComponent(file)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) });
				if (revision.current === capturedRevision && activeFileRef.current === file) {
					documentRef.current = saved; dirtyRef.current = false;
					setDocument(saved); setDirty(false); setSaveState("saved");
				} else if (activeFileRef.current === file) {
					setSaveState("idle");
				}
				setScreenplays(await requestJson<ScreenplaySummary[]>("/editor-api/screenplays"));
				return true;
			} catch (reason) {
				setError(reason instanceof Error ? reason.message : String(reason)); setSaveState("error");
				return false;
			}
		})();
		savePromiseRef.current = task;
		const result = await task;
		if (savePromiseRef.current === task) savePromiseRef.current = null;
		return result;
	}, []);

	useEffect(() => {
		void requestJson<BootstrapResponse>("/editor-api/bootstrap").then((payload) => { setIndex(payload.index); setScreenplays(payload.screenplays); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
	}, []);

	useEffect(() => {
		const timer = window.setInterval(() => void saveCurrentDocument(), AUTO_SAVE_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [saveCurrentDocument]);

	useEffect(() => {
		if (!document?.blocks) return;
		const timer = window.setTimeout(() => {
			const current = documentRef.current;
			if (!current) return;
			const next = syncScreenplayCharacters(current);
			const unchanged = next.characters.visible.length === current.characters.visible.length
				&& next.characters.hidden.length === current.characters.hidden.length
				&& next.characters.visible.every((character, index) => character === current.characters.visible[index])
				&& next.characters.hidden.every((character, index) => character === current.characters.hidden[index]);
			if (unchanged) return;
			documentRef.current = next;
			setDocument(next);
			revision.current += 1;
			dirtyRef.current = true;
			setDirty(true);
			setSaveState("idle");
		}, 400);
		return () => window.clearTimeout(timer);
	}, [document?.blocks]);

	useEffect(() => {
		if (!activeSearchMatch) return;
		const frame = window.requestAnimationFrame(() => window.document.querySelector<HTMLElement>('[data-search-active="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" }));
		return () => window.cancelAnimationFrame(frame);
	}, [activeSearchMatch]);

	useEffect(() => {
		function warnBeforeClose(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
		window.addEventListener("beforeunload", warnBeforeClose);
		return () => window.removeEventListener("beforeunload", warnBeforeClose);
	}, [dirty]);

	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (event.key === "Escape" && missionContentTocOpen) {
				event.preventDefault();
				setMissionContentTocOpen(false);
				return;
			}
			if (event.key === "Escape" && missionTocOpen) {
				event.preventDefault();
				setMissionTocOpen(false);
				return;
			}
			if (event.key === "Escape" && (multiSelectMode || selectedBlockId)) {
				event.preventDefault();
				const target = event.target as HTMLElement | null;
				if (target?.matches("input, textarea, [contenteditable='true']")) target.blur();
				setMultiSelectMode(false); setMultiSelected([]); multiSelectionChanged.current = false; scriptSelectionAnchor.current = null;
				setSelectedBlockId(null); setSelectedNodePath([]); setDialogueCursor(null);
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
				event.preventDefault(); void saveCurrentDocument(); return;
			}
			if (event.ctrlKey && event.key.toLowerCase() === "k") {
				if (splitDialogueActionRef.current()) event.preventDefault();
				return;
			}
			if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
				if (cutSelectionActionRef.current()) event.preventDefault();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
				if (pasteSelectionActionRef.current()) event.preventDefault();
				return;
			}
			if (event.key === "Shift" && !multiSelectMode) {
				multiSelectionChanged.current = false;
				setMultiSelectMode(true);
				const seed = selectedBlockId ? { blockId: selectedBlockId, path: selectedNodePath } : null;
				setMultiSelected(seed ? [seed] : []);
				scriptSelectionAnchor.current = seed;
			}
		}
		function keyUp(event: KeyboardEvent) {
			if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
			if (event.key === "Shift" && multiSelectMode && !multiSelectionChanged.current) {
				setMultiSelectMode(false); setMultiSelected([]); scriptSelectionAnchor.current = null;
			}
		}
		window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp);
		return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); };
	}, [missionContentTocOpen, missionTocOpen, multiSelectMode, saveCurrentDocument, selectedBlockId, selectedNodePath]);

	async function refreshScreenplays() { setScreenplays(await requestJson<ScreenplaySummary[]>("/editor-api/screenplays")); }
	function mutateDocument(update: (current: ScreenplayDocument) => ScreenplayDocument) { setDocument((current) => { if (!current) return current; const next = update(current); documentRef.current = next; return next; }); revision.current += 1; dirtyRef.current = true; setDirty(true); setSaveState("idle"); }
	function recordDialogueCursor(address: ScriptNodeAddress, offset: number) {
		dialogueCursorRef.current = { address, offset };
		if (!dialogueCursor || !sameScriptAddress(dialogueCursor.address, address)) setDialogueCursor({ address, offset });
	}
	function exitMultiSelect() { setMultiSelectMode(false); setMultiSelected([]); multiSelectionChanged.current = false; scriptSelectionAnchor.current = null; }
	function toggleEditorFocusMode() {
		const next = !editorFocusMode;
		setEditorFocusMode(next);
		if (next) setTitleNavigatorOpen(true);
		else setMissionTocOpen(false);
	}
	function navigateToScriptTitle(entry: ScriptTitleEntry) {
		const block = document?.blocks.find((candidate) => candidate.id === entry.blockId);
		if (!block) return;
		const expanded = expandFoldsAlongPath(block.node, entry.path);
		if (expanded !== block.node) updateBlockNode(block.id, [], expanded);
		exitMultiSelect(); setDialogueCursor(null); setSelectedBlockId(entry.blockId); setSelectedNodePath(entry.path);
		window.setTimeout(() => window.document.getElementById(scriptNodeDomId(entry))?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
	}

	async function openMission(mission: MissionRef) {
		setSelectedMission(mission); setMissionDocument(null); setSelectedSource(new Set()); setMissionContentTocOpen(false); selectionAnchor.current = null; setError("");
		try {
			const loaded = await requestJson<MissionDocument>(`/editor-api/mission?path=${encodeURIComponent(mission.dataFile)}`);
			setMissionDocument({ ...loaded, content: groupLegacyMessageThreadNodes(loaded.content) });
		}
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}
	function openMissionHeading(heading: MissionContentHeading) {
		window.document.getElementById(sourceNodeDomId(heading.path))?.scrollIntoView({ block: "start", behavior: "smooth" });
	}
	async function openSelectedBlockSource() {
		if (!selectedSourceMission) return;
		setEditorFocusMode(false);
		setCategoryFilter(selectedSourceMission.category);
		setLocationFilter("");
		await openMission(selectedSourceMission);
	}

	async function openScreenplay(name: string) {
		if (dirty && !window.confirm("当前修改尚未写入磁盘，仍要切换剧本吗？")) return;
		setError(""); exitMultiSelect(); setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0);
		try {
			const payload = await requestJson<ScreenplayDocument & { description?: string }>(`/editor-api/screenplay?name=${encodeURIComponent(name)}`);
			const normalized = normalizeScriptBlocks(Array.isArray(payload.blocks) ? payload.blocks : []);
			const fileId = name.replace(/\.json$/iu, "");
			const id = /^\d{3}$/u.test(payload.id) ? payload.id : /^\d{3}$/u.test(fileId) ? fileId : "";
			const base: ScreenplayDocument = { ...payload, schemaVersion: 2, id, title: payload.title === id ? "" : String(payload.title ?? ""), chapter: String(payload.chapter ?? payload.description ?? ""), characters: payload.characters && Array.isArray(payload.characters.hidden) ? payload.characters : { visible: [], hidden: [] }, blocks: normalized.blocks };
			const next = syncScreenplayCharacters(base);
			const changed = normalized.changed || payload.schemaVersion !== 2 || payload.id !== next.id || payload.title !== next.title || payload.chapter !== next.chapter || JSON.stringify(payload.characters) !== JSON.stringify(next.characters);
			setActiveFile(name); setDocument(next); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(changed); setSaveState("idle"); revision.current = changed ? 1 : 0;
		} 
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}

	async function closeScreenplay() {
		for (let attempt = 0; dirtyRef.current && attempt < 3; attempt += 1) {
			if (!await saveCurrentDocument()) return;
		}
		if (dirtyRef.current) { setError("剧本仍有尚未保存的修改，请稍后重试"); return; }
		exitMultiSelect(); setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0); setActiveFile(""); setDocument(null); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); setSaveState("idle");
	}

	async function createScreenplay() {
		const nextNumber = screenplays.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0) + 1;
		const id = String(nextNumber).padStart(3, "0"); const name = `${id}.json`;
		const now = new Date().toISOString();
		const fresh: ScreenplayDocument = { schemaVersion: 2, id, title: "", chapter: "", characters: { visible: [], hidden: [] }, createdAt: now, updatedAt: now, blocks: [] };
		try {
			const saved = await requestJson<ScreenplayDocument>(`/editor-api/screenplay?name=${encodeURIComponent(name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fresh) });
			setActiveFile(name); setDocument(saved); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); setSaveState("saved"); await refreshScreenplays();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}

	function setCharacterHidden(character: string, hidden: boolean) {
		mutateDocument((current) => ({ ...current, characters: { visible: hidden ? current.characters.visible.filter((item) => item !== character) : [...current.characters.visible, character], hidden: hidden ? [...current.characters.hidden, character] : current.characters.hidden.filter((item) => item !== character) } }));
	}

	function convertTrailblazerSpeakers() {
		mutateDocument((current) => ({ ...current, blocks: current.blocks.map((block) => ({ ...block, node: replaceDialogueSpeaker(block.node, "开拓者", "穹") })) }));
	}

	function toggleScriptSearch(mode: SearchMode) {
		if (searchMode === mode) { setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0); return; }
		exitMultiSelect(); setSelectedBlockId(null); setSelectedNodePath([]); setDialogueCursor(null); setSearchMode(mode); setSearchMatches(collectScriptTextMatches(document, mode)); setSearchMatchIndex(0);
	}

	function navigateScriptSearch(direction: -1 | 1) {
		if (!searchMode) return;
		const previousMatch = activeSearchMatch;
		const refreshed = collectScriptTextMatches(document, searchMode);
		setSearchMatches(refreshed);
		if (!refreshed.length) { setSearchMatchIndex(0); return; }
		const exactIndex = previousMatch ? refreshed.findIndex((match) => sameScriptAddress(match.address, previousMatch.address) && match.field === previousMatch.field && match.start === previousMatch.start && match.term === previousMatch.term) : -1;
		if (exactIndex >= 0) setSearchMatchIndex((exactIndex + direction + refreshed.length) % refreshed.length);
		else if (direction > 0) setSearchMatchIndex(Math.min(normalizedSearchIndex, refreshed.length - 1));
		else setSearchMatchIndex((Math.min(normalizedSearchIndex, refreshed.length) - 1 + refreshed.length) % refreshed.length);
	}

	function replaceCurrentGenderMatch() {
		const match = activeSearchMatch; if (!match?.replacement || !document) return;
		const block = document.blocks.find((candidate) => candidate.id === match.address.blockId); if (!block) return;
		const node = nestedNodeAtPath(block.node, match.address.path); if (!node) return;
		const value = node[match.field]; if (typeof value !== "string") return;
		updateBlockNode(block.id, match.address.path, { ...node, [match.field]: `${value.slice(0, match.start)}${match.replacement}${value.slice(match.end)}` });
	}

	async function reorderScreenplayList(from: string, to: string) {
		if (from === to) return;
		const fromIndex = screenplays.findIndex((item) => item.name === from); const toIndex = screenplays.findIndex((item) => item.name === to);
		if (fromIndex < 0 || toIndex < 0) return;
		const next = [...screenplays]; const [moved] = next.splice(fromIndex, 1); next.splice(toIndex, 0, moved); setScreenplays(next); setDraggedScreenplay(null);
		try { setScreenplays(await requestJson<ScreenplaySummary[]>("/editor-api/reorder-screenplays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next.map((item) => item.name) }) })); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); await refreshScreenplays(); }
	}

	async function deleteScreenplay() {
		if (!activeFile || !window.confirm(`确定删除「${activeFile}」吗？此操作不可撤销。`)) return;
		try { await requestJson(`/editor-api/screenplay?name=${encodeURIComponent(activeFile)}`, { method: "DELETE" }); setActiveFile(""); setDocument(null); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); await refreshScreenplays(); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}

	function toggleSource(path: NodePath, descendants: NodePath[] = [], modifiers: SelectionModifiers = {}) {
		const key = pathKey(path);
		setSelectedSource((current) => {
			if (modifiers.forceDeselect) {
				const next = new Set(current);
				next.delete(key);
				descendants.forEach((descendant) => next.delete(pathKey(descendant)));
				return next;
			}
			if (modifiers.forceSelect) {
				const next = new Set(current);
				next.add(key);
				descendants.forEach((descendant) => next.add(pathKey(descendant)));
				return next;
			}
			if (modifiers.shiftKey && selectionAnchor.current) {
				const anchorIndex = sourcePaths.findIndex((candidate) => pathKey(candidate) === selectionAnchor.current);
				const targetIndex = sourcePaths.findIndex((candidate) => pathKey(candidate) === key);
				if (anchorIndex >= 0 && targetIndex >= 0) {
					const from = Math.min(anchorIndex, targetIndex);
					const to = Math.max(anchorIndex, targetIndex);
					const next = modifiers.additive ? new Set(current) : new Set<string>();
					for (const rangePath of sourcePaths.slice(from, to + 1)) {
						next.add(pathKey(rangePath));
					}
					return next;
				}
			}
			const next = new Set(current);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
		if (!modifiers.shiftKey || !selectionAnchor.current) selectionAnchor.current = key;
	}

	function appendSource(paths: NodePath[], placement: "end" | "below") {
		if (!document || !missionDocument || !selectedMission) return;
		exitMultiSelect();
		const pathsWithoutDuplicateChildren = paths.filter((path) => !paths.some((candidate) => isAncestorPath(candidate, path)));
		const blocks = pathsWithoutDuplicateChildren.flatMap((path) => {
			const node = nodeAtPath(missionDocument.content, path);
			if (!node || typeof path[0] !== "number") return [];
			const isChoiceOption = path.length >= 3 && path.at(-2) === "options" && typeof path.at(-1) === "number";
			const optionIsMessage = isChoiceOption && Boolean(findMessageOwner(Array.isArray(node.content) ? node.content as JsonNode[] : []));
			const expandedNodes = isChoiceOption ? expandChoiceOption(node, optionIsMessage) : expandDialogueChoices(node);
			return expandedNodes.map((expandedNode) => ({
				id: crypto.randomUUID(),
				source: {
					mission: selectedMission.name,
					dataFile: selectedMission.dataFile,
					contentIndex: path[0] as number,
					...(path.length > 1 ? { contentPath: path.slice(1) } : {}),
				},
				node: expandedNode,
			}));
		});
		if (!blocks.length) return;
		if (placement === "end") {
			mutateDocument((current) => ({ ...current, blocks: [...current.blocks, ...blocks] }));
			setSelectedBlockId(blocks.at(-1)!.id); setSelectedNodePath([]);
		} else if (selectedBlock && selectedNode) {
			if (!selectedNodePath.length) {
				mutateDocument((current) => {
					const next = [...current.blocks];
					const index = next.findIndex((block) => block.id === selectedBlock.id);
					if (index >= 0) next.splice(index + 1, 0, ...blocks);
					return { ...current, blocks: next };
				});
				setSelectedBlockId(blocks.at(-1)!.id); setSelectedNodePath([]);
			} else {
				const parentPath = selectedNodePath.slice(0, -1);
				const index = selectedNodePath.at(-1)!;
				const parent = nestedNodeAtPath(selectedBlock.node, parentPath);
				if (!parent) return;
				const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
				const insertedNodes = blocks.map((block) => block.node);
				const next = [...siblings]; next.splice(index + 1, 0, ...insertedNodes);
				updateBlockNode(selectedBlock.id, parentPath, { ...parent, content: next });
				setSelectedBlockId(selectedBlock.id); setSelectedNodePath([...parentPath, index + insertedNodes.length]);
			}
		}
		setSelectedSource(new Set()); selectionAnchor.current = null;
	}

	function insertScriptNodes(nodes: JsonNode[]) {
		if (!nodes.length) return;
		const templates = nodes.map(clone);
		setDialogueCursor(null); exitMultiSelect();
		if (!selectedBlock || !selectedNode) {
			const blocks = templates.map((node) => ({ id: crypto.randomUUID(), node }));
			mutateDocument((current) => ({ ...current, blocks: [...current.blocks, ...blocks] }));
			setSelectedBlockId(blocks.at(-1)!.id); setSelectedNodePath([]); return;
		}
		if (selectedNode.type === "fold" || selectedNode.type === "message-thread") {
			const content = Array.isArray(selectedNode.content) ? selectedNode.content as JsonNode[] : [];
			updateBlockNode(selectedBlock.id, selectedNodePath, { ...selectedNode, content: [...content, ...templates] });
			setSelectedNodePath([...selectedNodePath, content.length + templates.length - 1]); return;
		}
		if (!selectedNodePath.length) {
			const blocksToInsert = templates.map((node) => ({ id: crypto.randomUUID(), node }));
			mutateDocument((current) => { const blocks = [...current.blocks]; blocks.splice(selectedBlockIndex + 1, 0, ...blocksToInsert); return { ...current, blocks }; });
			setSelectedBlockId(blocksToInsert.at(-1)!.id); setSelectedNodePath([]); return;
		}
		const parentPath = selectedNodePath.slice(0, -1); const index = selectedNodePath.at(-1)!;
		const parent = nestedNodeAtPath(selectedBlock.node, parentPath); if (!parent) return;
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const next = [...siblings]; next.splice(index + 1, 0, ...templates);
		updateBlockNode(selectedBlock.id, parentPath, { ...parent, content: next });
		setSelectedNodePath([...parentPath, index + templates.length]);
	}
	function insertScriptNode(type: string) {
		insertScriptNodes([newNodeTemplates[type] ?? newNodeTemplates.text]);
	}

	async function openImagePicker(mode: "add" | "replace") {
		if (mode === "replace" && selectedNode?.type !== "image") return;
		setImagePickerMode(mode); setImageSearch("");
		if (imageAssets.length) return;
		setImageLoading(true);
		try { setImageAssets(await requestJson<ImageAsset[]>("/editor-api/images")); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setImagePickerMode(null); }
		finally { setImageLoading(false); }
	}

	function chooseImage(image: ImageAsset) {
		if (imagePickerMode === "replace" && selectedBlock && selectedNode?.type === "image") {
			updateBlockNode(selectedBlock.id, selectedNodePath, { ...selectedNode, file: image.file, asset: image.asset });
		} else if (imagePickerMode === "add") {
			insertScriptNodes([{ type: "image", file: image.file, asset: image.asset }]);
		}
		setImagePickerMode(null);
	}
	function importScriptLines(type: "narration" | "dialogue") {
		const lines = importText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
		if (!lines.length) return;
		insertScriptNodes(lines.map((text) => type === "dialogue" ? { type, speaker: "？？？", text } : { type, text }));
		setImportText(""); setImportOpened(false);
	}
	function importSrt(type: "text" | "dialogue") {
		const entries = parseSrtEntries(importText);
		if (!entries.length) { setError("没有从 SRT 中识别出可导入的字幕"); return; }
		insertScriptNodes(entries.map((text) => type === "dialogue" ? { type, speaker: "？？？", text } : { type, text }));
		setImportText(""); setImportOpened(false);
	}
	async function importWikitext() {
		if (!importText.trim()) return;
		setImportLoading(true); setError("");
		try {
			const parsed = await requestJson<{ content: JsonNode[] }>("/editor-api/parse-wikitext", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: importText }) });
			const nodes = parsed.content.flatMap(expandDialogueChoices);
			if (!nodes.length) throw new Error("没有从源代码中识别出可导入的内容");
			insertScriptNodes(nodes); setImportText(""); setImportOpened(false);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setImportLoading(false);
		}
	}
	function updateBlockNode(id: string, path: number[], node: JsonNode) { mutateDocument((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === id ? { ...block, node: normalizeMessageThreads(path.length ? updateNestedNode(block.node, path, () => node) : node) } : block) })); }
	function scriptAddressRange(from: ScriptNodeAddress, to: ScriptNodeAddress) {
		if (!document || scriptSiblingGroup(from) !== scriptSiblingGroup(to)) return null;
		if (!from.path.length && !to.path.length) {
			const fromIndex = document.blocks.findIndex((block) => block.id === from.blockId);
			const toIndex = document.blocks.findIndex((block) => block.id === to.blockId);
			if (fromIndex < 0 || toIndex < 0) return null;
			return document.blocks.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1).map((block) => ({ blockId: block.id, path: [] }));
		}
		if (from.blockId !== to.blockId || !sameNumberPath(from.path.slice(0, -1), to.path.slice(0, -1))) return null;
		const fromIndex = from.path.at(-1)!; const toIndex = to.path.at(-1)!;
		const parentPath = from.path.slice(0, -1);
		const block = document.blocks.find((candidate) => candidate.id === from.blockId);
		const parent = block ? nestedNodeAtPath(block.node, parentPath) : null;
		const siblings = parent && Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		return siblings.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1).map((_, offset) => ({ blockId: from.blockId, path: [...parentPath, Math.min(fromIndex, toIndex) + offset] }));
	}
	function handleScriptSelect(address: ScriptNodeAddress, shiftKey: boolean) {
		setDialogueCursor(null);
		if (!multiSelectMode && !shiftKey) {
			setSelectedBlockId(address.blockId); setSelectedNodePath(address.path); scriptSelectionAnchor.current = address; return;
		}
		if (!multiSelectMode) setMultiSelectMode(true);
		multiSelectionChanged.current = true;
		const seed = multiSelectMode ? multiSelected : selectedBlockId ? [{ blockId: selectedBlockId, path: selectedNodePath }] : [];
		const range = shiftKey && scriptSelectionAnchor.current ? scriptAddressRange(scriptSelectionAnchor.current, address) : null;
		const sameGroup = !seed.length || scriptSiblingGroup(seed[0]) === scriptSiblingGroup(address);
		const base = sameGroup ? seed : [];
		const existing = base.findIndex((candidate) => sameScriptAddress(candidate, address));
		const next = range ?? (existing >= 0 ? base.filter((_, index) => index !== existing) : [...base, address]);
		setMultiSelected(next);
		setSelectedBlockId(address.blockId); setSelectedNodePath(address.path);
		if (!shiftKey || !scriptSelectionAnchor.current || !range) scriptSelectionAnchor.current = address;
	}
	function dissolveSelectedFold() {
		if (!selectedBlock || !selectedNode || (selectedNode.type !== "fold" && selectedNode.type !== "message-thread") || activeScriptSelection.length !== 1) return;
		const content = Array.isArray(selectedNode.content) ? selectedNode.content as JsonNode[] : [];
		setDialogueCursor(null); exitMultiSelect();
		if (!selectedNodePath.length) {
			const newBlocks = content.map((node) => ({ id: crypto.randomUUID(), node: clone(node) }));
			mutateDocument((current) => { const blocks = current.blocks.filter((block) => block.id !== selectedBlock.id); blocks.splice(selectedBlockIndex, 0, ...newBlocks); return { ...current, blocks }; });
			setSelectedBlockId(newBlocks[0]?.id ?? null); setSelectedNodePath([]); return;
		}
		const parentPath = selectedNodePath.slice(0, -1); const index = selectedNodePath.at(-1)!;
		const parent = nestedNodeAtPath(selectedBlock.node, parentPath); if (!parent) return;
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const next = [...siblings]; next.splice(index, 1, ...content.map(clone));
		updateBlockNode(selectedBlock.id, parentPath, { ...parent, content: next });
		setSelectedNodePath(content.length ? [...parentPath, index] : parentPath);
	}
	function convertSelectedFoldToMessageThread() {
		if (!selectedBlock || !selectedNode || selectedNode.type !== "fold" || activeScriptSelection.length !== 1) return;
		setDialogueCursor(null); exitMultiSelect();
		updateBlockNode(selectedBlock.id, selectedNodePath, toMessageThread(selectedNode));
	}
	function foldSelectedNodes() {
		if (!canFoldSelection || !document) return;
		const title = "折叠内容";
		setDialogueCursor(null); exitMultiSelect();
		if (activeScriptSelection[0].path.length === 0) {
			const selectedIds = new Set(activeScriptSelection.map((address) => address.blockId));
			const selectedBlocks = document.blocks.filter((block) => selectedIds.has(block.id));
			const firstIndex = document.blocks.findIndex((block) => selectedIds.has(block.id));
			const id = crypto.randomUUID();
			const fold: ScriptBlock = { id, node: { type: "fold", title, content: selectedBlocks.map((block) => clone(block.node)) } };
			mutateDocument((current) => { const blocks = current.blocks.filter((block) => !selectedIds.has(block.id)); blocks.splice(firstIndex, 0, fold); return { ...current, blocks }; });
			setSelectedBlockId(id); setSelectedNodePath([]); return;
		}
		const block = document.blocks.find((candidate) => candidate.id === activeScriptSelection[0].blockId); if (!block) return;
		const parentPath = activeScriptSelection[0].path.slice(0, -1);
		const parent = nestedNodeAtPath(block.node, parentPath); if (!parent) return;
		const selectedIndexes = new Set(activeScriptSelection.map((address) => address.path.at(-1)!));
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const firstIndex = Math.min(...selectedIndexes);
		const foldedContent = siblings.filter((_, index) => selectedIndexes.has(index)).map(clone);
		const next = siblings.filter((_, index) => !selectedIndexes.has(index));
		next.splice(firstIndex, 0, { type: "fold", title, content: foldedContent });
		updateBlockNode(block.id, parentPath, { ...parent, content: next });
		setSelectedBlockId(block.id); setSelectedNodePath([...parentPath, firstIndex]);
	}
	function mergeSelectedDialogues() {
		if (!canMergeDialogues || !document) return;
		const selection = [...activeScriptSelection];
		setDialogueCursor(null); exitMultiSelect();
		if (!selection[0].path.length) {
			const selectedIds = new Set(selection.map((address) => address.blockId));
			const selectedBlocks = document.blocks.filter((block) => selectedIds.has(block.id));
			const first = selectedBlocks[0]; if (!first) return;
			const firstIndex = document.blocks.findIndex((block) => block.id === first.id);
			const merged = { ...first, node: { ...first.node, text: selectedBlocks.map((block) => String(block.node.text ?? "")).join("") } };
			mutateDocument((current) => { const blocks = current.blocks.filter((block) => !selectedIds.has(block.id)); blocks.splice(firstIndex, 0, merged); return { ...current, blocks }; });
			setSelectedBlockId(first.id); setSelectedNodePath([]); return;
		}
		const block = document.blocks.find((candidate) => candidate.id === selection[0].blockId); if (!block) return;
		const parentPath = selection[0].path.slice(0, -1);
		const parent = nestedNodeAtPath(block.node, parentPath); if (!parent) return;
		const indexes = selection.map((address) => address.path.at(-1)!).sort((left, right) => left - right);
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const firstIndex = indexes[0]; const first = siblings[firstIndex]; if (!first) return;
		const merged = { ...first, text: indexes.map((index) => String(siblings[index]?.text ?? "")).join("") };
		const next = [...siblings]; next.splice(firstIndex, indexes.length, merged);
		updateBlockNode(block.id, parentPath, { ...parent, content: next });
		setSelectedBlockId(block.id); setSelectedNodePath([...parentPath, firstIndex]);
	}
	function splitSelectedDialogue() {
		const latestCursor = dialogueCursorRef.current;
		if (!selectedBlock || !selectedNode || selectedNode.type !== "dialogue" || !dialogueCursor || !latestCursor || latestCursor.address.blockId !== selectedBlock.id || !sameNumberPath(latestCursor.address.path, selectedNodePath)) return false;
		const text = String(selectedNode.text ?? "");
		const offset = Math.max(0, Math.min(latestCursor.offset, text.length));
		const first = { ...selectedNode, text: text.slice(0, offset).replace(/[，\s]+$/u, "") };
		const second = { ...clone(selectedNode), text: text.slice(offset).replace(/^[，\s]+/u, "") };
		setDialogueCursor(null);
		if (!selectedNodePath.length) {
			const id = crypto.randomUUID();
			mutateDocument((current) => { const blocks = [...current.blocks]; blocks[selectedBlockIndex] = { ...selectedBlock, node: first }; blocks.splice(selectedBlockIndex + 1, 0, { ...clone(selectedBlock), id, node: second }); return { ...current, blocks }; });
			setSelectedBlockId(id); setSelectedNodePath([]); return true;
		}
		const parentPath = selectedNodePath.slice(0, -1); const index = selectedNodePath.at(-1)!;
		const parent = nestedNodeAtPath(selectedBlock.node, parentPath); if (!parent) return false;
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const next = [...siblings]; next.splice(index, 1, first, second);
		updateBlockNode(selectedBlock.id, parentPath, { ...parent, content: next });
		setSelectedNodePath([...parentPath, index + 1]);
		return true;
	}
	function deleteSelectedNode() {
		const deleteCount = activeScriptSelection.length;
		if (!deleteCount) return;
		if (!window.confirm(deleteCount > 1 ? `确定删除选中的 ${deleteCount} 个内容块吗？` : "确定删除当前内容块吗？")) return;
		if (activeScriptSelection.length > 1 && canFoldSelection && document) {
			const selection = [...activeScriptSelection]; exitMultiSelect(); setDialogueCursor(null);
			if (!selection[0].path.length) {
				const ids = new Set(selection.map((address) => address.blockId));
				mutateDocument((current) => ({ ...current, blocks: current.blocks.filter((block) => !ids.has(block.id)) }));
				setSelectedBlockId(null); setSelectedNodePath([]); return;
			}
			const block = document.blocks.find((candidate) => candidate.id === selection[0].blockId); if (!block) return;
			const parentPath = selection[0].path.slice(0, -1);
			const parent = nestedNodeAtPath(block.node, parentPath); if (!parent) return;
			const indexes = new Set(selection.map((address) => address.path.at(-1)!));
			const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
			updateBlockNode(block.id, parentPath, { ...parent, content: siblings.filter((_, index) => !indexes.has(index)) });
			setSelectedBlockId(block.id); setSelectedNodePath(parentPath); return;
		}
		if (!selectedBlock || !selectedNode) return;
		exitMultiSelect(); setDialogueCursor(null);
		if (!selectedNodePath.length) {
			const id = selectedBlock.id; setSelectedBlockId(null); setSelectedNodePath([]);
			mutateDocument((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== id) })); return;
		}
		const parentPath = selectedNodePath.slice(0, -1); const index = selectedNodePath.at(-1)!;
		const parent = nestedNodeAtPath(selectedBlock.node, parentPath); if (!parent) return;
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		updateBlockNode(selectedBlock.id, parentPath, { ...parent, content: siblings.filter((_, childIndex) => childIndex !== index) });
		setSelectedNodePath(parentPath);
	}
	function cutSelectedBlocks() {
		if (!document || !activeScriptSelection.length) return false;
		const selection = [...activeScriptSelection];
		const isTopLevel = selection.every((address) => address.path.length === 0);
		if (isTopLevel) {
			const selectedIds = new Set(selection.map((address) => address.blockId));
			const selectedBlocks = document.blocks.filter((block) => selectedIds.has(block.id));
			if (!selectedBlocks.length) return false;
			const firstIndex = document.blocks.findIndex((block) => selectedIds.has(block.id));
			cutBlocksRef.current = selectedBlocks.map((block) => ({ ...(block.source ? { source: clone(block.source) } : {}), node: clone(block.node) }));
			const remaining = document.blocks.filter((block) => !selectedIds.has(block.id));
			mutateDocument((current) => ({ ...current, blocks: current.blocks.filter((block) => !selectedIds.has(block.id)) }));
			exitMultiSelect(); setDialogueCursor(null);
			const anchorIndex = remaining.length ? (firstIndex > 0 ? Math.min(firstIndex - 1, remaining.length - 1) : 0) : -1;
			setSelectedBlockId(anchorIndex >= 0 ? remaining[anchorIndex].id : null); setSelectedNodePath([]);
			return true;
		}
		const first = selection[0];
		if (selection.some((address) => address.blockId !== first.blockId || !sameNumberPath(address.path.slice(0, -1), first.path.slice(0, -1)))) return false;
		const block = document.blocks.find((candidate) => candidate.id === first.blockId); if (!block) return false;
		const parentPath = first.path.slice(0, -1);
		const parent = nestedNodeAtPath(block.node, parentPath); if (!parent) return false;
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const indexes = [...new Set(selection.map((address) => address.path.at(-1)!))].sort((left, right) => left - right);
		const selectedIndexes = new Set(indexes);
		cutBlocksRef.current = indexes.flatMap((index) => siblings[index] ? [{ node: clone(siblings[index]) }] : []);
		if (!cutBlocksRef.current.length) return false;
		const remaining = siblings.filter((_, index) => !selectedIndexes.has(index));
		updateBlockNode(block.id, parentPath, { ...parent, content: remaining });
		exitMultiSelect(); setDialogueCursor(null);
		if (remaining.length) {
			const anchorIndex = indexes[0] > 0 ? Math.min(indexes[0] - 1, remaining.length - 1) : 0;
			setSelectedBlockId(block.id); setSelectedNodePath([...parentPath, anchorIndex]);
		} else {
			setSelectedBlockId(block.id); setSelectedNodePath(parentPath);
		}
		return true;
	}
	function pasteCutBlocks() {
		if (!document || !selectedBlock || !selectedNode || !cutBlocksRef.current.length) return false;
		const clipboard = cutBlocksRef.current.map((block) => clone(block));
		exitMultiSelect(); setDialogueCursor(null);
		if (!selectedNodePath.length) {
			const inserted = clipboard.map((block) => ({ ...block, id: crypto.randomUUID() }));
			mutateDocument((current) => {
				const blocks = [...current.blocks];
				const targetIndex = blocks.findIndex((block) => block.id === selectedBlock.id);
				if (targetIndex < 0) return current;
				blocks.splice(targetIndex + 1, 0, ...inserted);
				return { ...current, blocks };
			});
			setSelectedBlockId(inserted.at(-1)!.id); setSelectedNodePath([]);
			return true;
		}
		const parentPath = selectedNodePath.slice(0, -1); const targetIndex = selectedNodePath.at(-1)!;
		const parent = nestedNodeAtPath(selectedBlock.node, parentPath); if (!parent) return false;
		const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
		const insertedNodes = clipboard.map((block) => clone(block.node));
		const next = [...siblings]; next.splice(targetIndex + 1, 0, ...insertedNodes);
		updateBlockNode(selectedBlock.id, parentPath, { ...parent, content: next });
		setSelectedBlockId(selectedBlock.id); setSelectedNodePath([...parentPath, targetIndex + insertedNodes.length]);
		return true;
	}
	function moveScriptNode(targetAddress: ScriptNodeAddress, draggedAddress: ScriptNodeAddress, nest: boolean) {
		if (targetAddress.blockId === draggedAddress.blockId && (sameNumberPath(targetAddress.path, draggedAddress.path) || isNumberPathAncestor(draggedAddress.path, targetAddress.path))) return;
		exitMultiSelect();
		mutateDocument((current) => {
			let blocks = [...current.blocks];
			const sourceBlock = blocks.find((block) => block.id === draggedAddress.blockId);
			if (!sourceBlock) return current;
			let draggedNode: JsonNode | null = sourceBlock.node;
			let draggedTopBlock: ScriptBlock | null = null;
			if (!draggedAddress.path.length) {
				draggedTopBlock = sourceBlock;
				blocks = blocks.filter((block) => block.id !== sourceBlock.id);
			} else {
				const removed = removeNestedNode(sourceBlock.node, draggedAddress.path);
				draggedNode = removed.node;
				blocks = blocks.map((block) => block.id === sourceBlock.id ? { ...block, node: removed.root } : block);
			}
			if (!draggedNode) return current;
			const targetPath = targetAddress.blockId === draggedAddress.blockId ? adjustTargetPathAfterRemoval(targetAddress.path, draggedAddress.path) : targetAddress.path;
			const targetBlock = blocks.find((block) => block.id === targetAddress.blockId);
			if (!targetBlock) return current;
			const targetNode = nestedNodeAtPath(targetBlock.node, targetPath);
			if (!targetNode) return current;
			if (nest && (targetNode.type === "fold" || targetNode.type === "message-thread")) {
				const targetContent = Array.isArray(targetNode.content) ? targetNode.content as JsonNode[] : [];
				blocks = blocks.map((block) => block.id === targetBlock.id ? { ...block, node: updateNestedNode(block.node, targetPath, (node) => {
					const updated = { ...node, content: [...targetContent, clone(draggedNode!)] };
					return node.type === "message-thread" ? toMessageThread(updated) : updated;
				}) } : block);
				return { ...current, blocks };
			}
			if (!targetPath.length) {
				const targetIndex = blocks.findIndex((block) => block.id === targetBlock.id);
				blocks.splice(targetIndex, 0, draggedTopBlock ?? { id: crypto.randomUUID(), node: clone(draggedNode) });
				return { ...current, blocks };
			}
			const parentPath = targetPath.slice(0, -1); const targetIndex = targetPath.at(-1)!;
			const parent = nestedNodeAtPath(targetBlock.node, parentPath); if (!parent) return current;
			const siblings = Array.isArray(parent.content) ? parent.content as JsonNode[] : [];
			const next = [...siblings]; next.splice(targetIndex, 0, clone(draggedNode));
			blocks = blocks.map((block) => block.id === targetBlock.id ? { ...block, node: updateNestedNode(block.node, parentPath, (node) => ({ ...node, content: next })) } : block);
			return { ...current, blocks };
		});
		setSelectedBlockId(targetAddress.blockId); setSelectedNodePath(targetAddress.path);
	}

	useEffect(() => {
		cutSelectionActionRef.current = cutSelectedBlocks;
		pasteSelectionActionRef.current = pasteCutBlocks;
		splitDialogueActionRef.current = splitSelectedDialogue;
	});

	return (
		<div className={`app-shell ${editorFocusMode ? "is-editor-focus" : ""}`}>
			<ImportDialog opened={importOpened} mode={importMode} text={importText} loading={importLoading} onClose={() => setImportOpened(false)} onModeChange={setImportMode} onTextChange={setImportText} onImportPlain={importScriptLines} onImportSrt={importSrt} onImportSource={() => void importWikitext()} />
			<ImagePickerDialog mode={imagePickerMode} search={imageSearch} assets={filteredImageAssets} total={imageAssets.length} loading={imageLoading} onClose={() => setImagePickerMode(null)} onSearchChange={setImageSearch} onChoose={chooseImage} />
			<header className="topbar"><div className="brand"><span className="brand-mark">C</span><div><h1>Castorice 剧本编辑器</h1><p>星穹铁道任务素材 · 剧本编排工作台</p></div></div><div className="topbar-actions"><Button variant={editorFocusMode ? "filled" : "light"} size="sm" onClick={toggleEditorFocusMode}>{editorFocusMode ? "退出专注模式" : "专注模式"}</Button><div className={`save-indicator ${saveState}`} title="每 10 秒自动保存；按 Ctrl+S 可立即保存"><span />{!activeFile ? "未打开剧本" : saveState === "saving" ? "正在保存…" : saveState === "error" ? "保存失败" : dirty ? "等待自动保存" : "已保存到本地"}</div></div></header>
			{error ? <div className="error-banner"><span>{error}</span><Button variant="subtle" color="red" size="xs" onClick={() => setError("")}>关闭</Button></div> : null}
			<main className="workspace">
				<section className="source-pane">
					<aside className="mission-sidebar">
						<div className="pane-heading"><h2>任务资料库</h2><Badge color="blue" size="sm">{filteredMissions.length}</Badge></div>
						<TextInput className="library-search" size="sm" leftSection={<IconSearch size={14} />} placeholder="搜索任务、系列或地点" value={missionFilter} onChange={(event) => setMissionFilter(event.target.value)} />
						<Select className="library-category" aria-label="按任务种类筛选" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setLocationFilter(""); }} data={[{ value: "", label: "所有任务种类" }, ...missionCategories.map((category) => ({ value: category, label: category }))]} />
						<Select className="library-location" leftSection={<IconMapPin size={14} />} aria-label="按地点筛选" value={locationFilter} onChange={setLocationFilter} data={[{ value: "", label: "所有地点" }, ...missionLocations.map((location) => ({ value: location, label: location }))]} />
						<div className="mission-list">{missionGroups.length ? missionGroups.map((locationGroup) => <section className="mission-location" key={locationGroup.location}>
							<h3>{locationGroup.location}</h3>
							{locationGroup.series.map((series) => <div className="mission-series" key={series.name}>
								<h4>{series.name}</h4>
								{series.entries.map((mission) => <NavLink key={mission.dataFile} className="mission-item" active={selectedMission?.dataFile === mission.dataFile} title={`${mission.category} / ${mission.location} / ${mission.series} / ${mission.name}`} label={<span className="mission-name">{mission.name}</span>} onClick={() => void openMission(mission)} />)}
							</div>)}
						</section>) : <p className="mission-empty">没有符合条件的任务</p>}</div>
					</aside>
					<div className="source-preview">
						{selectedMission ? <>
							<header className="preview-header">
								<div className="preview-heading"><span className="eyebrow">{selectedMission.category} / {selectedMission.location}</span><h2>{selectedMission.name}</h2><p>{selectedMission.series}</p></div>
								<div className="preview-header-side"><div className="preview-navigation">
									<Tooltip label="当前任务内容目录"><IconButton className="mission-toc-trigger" aria-label="打开当前任务内容目录" variant={missionContentTocOpen ? "light" : "outline"} color="blue" size="md" aria-pressed={missionContentTocOpen} onClick={() => { setMissionTocOpen(false); setMissionContentTocOpen((current) => !current); }}><IconListTree /></IconButton></Tooltip>
									{editorFocusMode ? <Tooltip label="浏览全部任务"><IconButton className="mission-toc-trigger" aria-label="打开完整任务目录" variant={missionTocOpen ? "light" : "outline"} color="blue" size="md" aria-pressed={missionTocOpen} onClick={() => { setMissionContentTocOpen(false); setMissionTocOpen((current) => !current); }}><IconBooks /></IconButton></Tooltip> : null}
								</div></div>
							</header>
							<div className="selection-toolbar">
								<Button variant="subtle" size="xs" onClick={() => { setSelectedSource(new Set(sourcePaths.map(pathKey))); selectionAnchor.current = null; }}>全选内容</Button>
								<Button variant="subtle" color="gray" size="xs" onClick={() => { setSelectedSource(new Set()); selectionAnchor.current = null; }}>清除选择</Button>
								<span className="selection-toolbar-divider" />
								<Button variant="subtle" size="xs" disabled={!document || selectedSource.size === 0} onClick={() => appendSource(sourcePaths.filter((path) => selectedSource.has(pathKey(path))), "end")}>追加到剧本 {selectedSource.size ? `(${selectedSource.size})` : ""}</Button>
								<Button size="xs" disabled={!document || selectedSource.size === 0 || !selectedNode} onClick={() => appendSource(sourcePaths.filter((path) => selectedSource.has(pathKey(path))), "below")}>插入到所选内容后 {selectedSource.size ? `(${selectedSource.size})` : ""}</Button>
							</div>
							<div className="source-cards">{missionDocument?.content.map((node, nodeIndex) => <SourceContentCard key={nodeIndex} node={node} path={[nodeIndex]} selected={selectedSource} onToggle={toggleSource} />)}</div>
							<MissionPager previous={previousMission} next={nextMission} position={selectedMissionPosition} total={filteredMissions.length} onOpen={(mission) => void openMission(mission)} />
							<MissionContentTocOverlay opened={missionContentTocOpen} missionName={selectedMission.name} headings={missionHeadings} onClose={() => setMissionContentTocOpen(false)} onOpen={openMissionHeading} />
							<MissionTocOverlay opened={missionTocOpen} groups={missionGroups} selectedFile={selectedMission.dataFile} total={filteredMissions.length} search={missionFilter} category={categoryFilter} location={locationFilter} categories={missionCategories} locations={missionLocations} onClose={() => setMissionTocOpen(false)} onOpen={(mission) => void openMission(mission)} onSearchChange={setMissionFilter} onCategoryChange={(value) => { setCategoryFilter(value); setLocationFilter(""); }} onLocationChange={setLocationFilter} />
						</> : <div className="empty-state"><span>←</span><h2>选择一个任务</h2><p>任务资料保持只读；选择所需内容后，可加入右侧剧本并独立编辑。</p></div>}
					</div>
				</section>
				<section className="script-pane">
					{document ? <div className="script-editor">
						<ScreenplayMetaPanel document={document} activeFile={activeFile} onBack={() => void closeScreenplay()} onTitleChange={(value) => mutateDocument((current) => ({ ...current, title: value }))} onChapterChange={(value) => mutateDocument((current) => ({ ...current, chapter: value }))} onCharacterHiddenChange={setCharacterHidden} onDelete={() => void deleteScreenplay()} />
						<div className={`script-editor-workspace ${titleNavigatorOpen ? "has-title-navigator" : ""}`}>
							<aside className="script-title-navigator" aria-hidden={!titleNavigatorOpen} inert={!titleNavigatorOpen ? true : undefined}><header className="script-title-navigator-heading"><span>章节目录</span><small>{scriptTitles.length} 个章节标题</small></header><nav>{scriptTitles.length ? scriptTitles.map((entry) => <Button key={`${entry.blockId}-${entry.path.join("-")}`} variant="subtle" color="gray" size="sm" className={selectedBlockId === entry.blockId && sameNumberPath(selectedNodePath, entry.path) ? "is-active" : ""} style={{ paddingLeft: `${12 + Math.min(entry.depth, 4) * 12}px` }} onClick={() => navigateToScriptTitle(entry)} title={entry.title}>{entry.title}</Button>) : <p>当前剧本没有章节标题</p>}</nav></aside>
							<div className="script-editor-main">
						<div className={`block-toolbar ${multiSelectMode ? "is-multi-select" : ""}`}>
							<div className="block-toolbar-actions toolbar-main-actions">
								<div className="toolbar-action-group is-navigation"><Tooltip label={titleNavigatorOpen ? "关闭章节目录" : "打开章节目录"}><IconButton variant={titleNavigatorOpen ? "light" : "subtle"} color="blue" size="md" aria-label={titleNavigatorOpen ? "关闭章节目录" : "打开章节目录"} aria-pressed={titleNavigatorOpen} onClick={() => setTitleNavigatorOpen((current) => !current)}><IconListTree size={16} /></IconButton></Tooltip></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">插入</span><Button variant="subtle" size="sm" onClick={() => insertScriptNode("dialogue")}>对话</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("narration")}>叙述</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("section")}>章节标题</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("divider")}>分割线</Button><MenuButton label="更多" items={[{ label: "普通文本", onClick: () => insertScriptNode("text") }, { label: "编辑注释", onClick: () => insertScriptNode("note") }]} /></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">导入</span><Button variant="subtle" size="sm" onClick={() => setImportOpened(true)}>批量导入</Button></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">图片</span><Button variant="subtle" size="sm" onClick={() => void openImagePicker("add")}>插入图片</Button><Button variant="subtle" size="sm" disabled={multiSelectMode || selectedNode?.type !== "image"} onClick={() => void openImagePicker("replace")}>替换图片</Button></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">结构</span><Tooltip label="将折叠组拆回独立内容块"><Button variant="subtle" color="orange" size="sm" disabled={activeScriptSelection.length !== 1 || (selectedNode?.type !== "fold" && selectedNode?.type !== "message-thread")} onClick={dissolveSelectedFold}>拆散内容组</Button></Tooltip><Tooltip label="将选中的相邻内容组成可折叠区域"><Button variant="subtle" size="sm" disabled={!canFoldSelection} onClick={foldSelectedNodes}>创建折叠组</Button></Tooltip><Tooltip label="将折叠组转换为带副标题和手机持有者的短信会话"><Button variant="subtle" color="teal" size="sm" disabled={activeScriptSelection.length !== 1 || selectedNode?.type !== "fold"} onClick={convertSelectedFoldToMessageThread}>转为短信会话</Button></Tooltip></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">对话</span><Tooltip label="仅能合并同级、相连且说话人相同的对话"><Button variant="subtle" size="sm" disabled={!canMergeDialogues} onClick={mergeSelectedDialogues}>合并对话</Button></Tooltip><Tooltip label={selectedNode?.type === "dialogue" ? "在台词光标处拆成两段（Ctrl+K）" : "仅对对话生效"}><Button variant="subtle" color="teal" size="sm" disabled={multiSelectMode || !canSplitDialogue} onMouseDown={(event) => event.preventDefault()} onClick={splitSelectedDialogue}>拆分对话</Button></Tooltip></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">管理</span><Tooltip label={activeScriptSelection.length > 1 ? `删除选中的 ${activeScriptSelection.length} 个内容块` : "删除当前内容块"}><Button variant="subtle" color="red" size="sm" disabled={!activeScriptSelection.length} onClick={deleteSelectedNode}>删除</Button></Tooltip><MenuButton label="批量工具" align="end" active={Boolean(searchMode)} items={[{ label: "统一主角名为“穹”", onClick: convertTrailblazerSpeakers }, { label: "检查性别指代", onClick: () => toggleScriptSearch("gender") }, { label: "查找主角称谓", onClick: () => toggleScriptSearch("trailblazer-reference") }]} /></div>
							</div>
							{multiSelectMode ? <div className="toolbar-selection multi-selection-status"><Badge variant="filled" color="blue" size="sm">多选</Badge><span>{multiSelected.length ? `已选择 ${multiSelected.length} 个同级内容块` : "点击内容块开始选择"} · Esc 退出</span></div> : !selectedNode ? <span className="toolbar-hint">按住 Shift 进入多选</span> : null}
						</div>
						{searchMode ? <div className="script-search-bar"><strong>{searchMode === "gender" ? "性别指代检查" : "主角称谓查找"}</strong><span className="script-search-term">{activeSearchMatch ? `“${activeSearchMatch.term}”` : "没有找到匹配内容"}</span><span className="script-search-count">{searchMatches.length ? `${normalizedSearchIndex + 1} / ${searchMatches.length}` : "0 / 0"}</span><Button variant="subtle" size="xs" onClick={() => navigateScriptSearch(-1)}>上一个</Button><Button variant="subtle" size="xs" onClick={() => navigateScriptSearch(1)}>下一个</Button>{searchMode === "gender" ? <Button size="xs" disabled={!activeSearchMatch?.replacement} onClick={replaceCurrentGenderMatch}>替换为“{activeSearchMatch?.replacement ?? "—"}”</Button> : null}<Button variant="subtle" color="gray" size="xs" onClick={() => { setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0); }}>关闭</Button></div> : null}
						<div className="script-blocks viewer-style">{document.blocks.length ? document.blocks.map((block) => <ScriptBlockView key={block.id} block={block} selectedAddresses={activeScriptSelection} editableAddress={editableAddress} activeMatch={activeSearchMatch} onSelect={handleScriptSelect} onChange={(path, node) => updateBlockNode(block.id, path, node)} onDrop={moveScriptNode} onDialogueCursor={recordDialogueCursor} />) : <div className="empty-script"><span>＋</span><h3>这个剧本还是空的</h3><p>从左侧加入任务内容，或通过上方工具栏插入内容。</p></div>}</div>
						<footer className="script-status-bar">{multiSelectMode ? <><strong>多选模式</strong><span>已选择 {multiSelected.length} 个同级内容块</span></> : selectedBlock && selectedNode ? <><strong>类型：{nodeLabel(selectedNode)}</strong><span className="script-status-source">来源：{scriptBlockSourceLabel(selectedBlock, selectedNodePath)}</span><Button className="script-status-source-button" variant="subtle" size="xs" disabled={!selectedSourceMission} onClick={() => void openSelectedBlockSource()}>转到来源任务</Button></> : <span>未选择内容</span>}</footer>
							</div>
						</div>
					</div> : <ScreenplayLibrary screenplays={screenplays} draggedName={draggedScreenplay} onCreate={() => void createScreenplay()} onOpen={(name) => void openScreenplay(name)} onDragStart={setDraggedScreenplay} onDragEnd={() => setDraggedScreenplay(null)} onReorder={(from, to) => void reorderScreenplayList(from, to)} />}
				</section>
			</main>
		</div>
	);
}

export default App;
