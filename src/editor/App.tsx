import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, ContextMenu, IconButton, MenuButton, Tooltip, type MenuEntry, type MenuItem } from "./ui";
import { IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconListTree, IconSettings, IconX } from "./ui/icons";
import { newNodeTemplates, nodeLabel, nodeLabels } from "./content/node-config";
import { SourceContentCard } from "./content/ReadOnlyContent";
import { ScriptBlockView } from "./content/ScriptBlockView";
import { collectScriptTextMatches, expandChoiceOption, expandDialogueChoices, findMessageOwner, flattenMissions, nestedNodeAtPath, replaceDialogueSpeaker, sameNumberPath, sameScriptAddress, scriptNodeDomId, scriptSiblingGroup, syncScreenplayCharacters, toMessageThread } from "./content/screenplay-model";
import { strikeMarkerBody, wrapStrikeMarker } from "./content/rich-text-utils";
import { convertTextNodes, convertibleTextTypes, cutSiblings, dissolveContainer, isContainerNode, isConvertibleTextNode, messageThreadToFold, foldSiblings, insertItems, mergeDialogues, moveNode, removeSiblings, siblingRange, splitDialogue, nodeAtAddress, updateNodeAt, type OperationResult } from "./content/screenplay-ops";
import { collectNodePaths, isAncestorPath, nodeAtPath, pathKey, sourceNodeDomId } from "./content/tree";
import type { BootstrapResponse, ImageAsset, JsonNode, MissionDocument, MissionIndex, MissionRef, NodePath, ScreenplayDocument, ScreenplaySummary, ScriptBlock, ScriptItem, ScriptNodeAddress, ScriptTextMatch, ScriptTitleEntry, SearchMode, SelectionModifiers } from "./content/types";
import { ImagePickerDialog } from "./components/ImagePickerDialog";
import { ImportDialog, type ImportMode } from "./components/ImportDialog";
import { MissionContentTocOverlay, type MissionContentHeading } from "./components/MissionContentTocOverlay";
import { MissionPager } from "./components/MissionPager";
import { MissionBrowser, type MissionBrowserProps } from "./components/MissionBrowser";
import { ScreenplayLibrary } from "./components/ScreenplayLibrary";
import { ScreenplayMetaPanel } from "./components/ScreenplayMetaPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { useScriptRunner } from "./components/useScriptRunner";
import "./content/content.css";
import "./App.css";

const AUTO_SAVE_INTERVAL_MS = 10_000;
const HISTORY_LIMIT = 200;
// Consecutive edits to the same field within this window collapse into one undo step (e.g. typing).
const HISTORY_COALESCE_MS = 1_500;

interface HistoryEntry {
	document: ScreenplayDocument;
	selection: ScriptNodeAddress | null;
}


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
	const text = await response.text();
	let payload: unknown;
	try { payload = text ? JSON.parse(text) : null; }
	catch { throw new Error(`请求失败：${response.status} ${response.statusText}${text ? ` · ${text.slice(0, 120)}` : ""}`); }
	if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? `请求失败：${response.status} ${response.statusText}`);
	return payload as T;
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
	const [lastMissionFile, setLastMissionFile] = useState<string>();
	const [missionContentTocOpen, setMissionContentTocOpen] = useState(false);
	const [titleNavigatorOpen, setTitleNavigatorOpen] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
	const [deleteNotice, setDeleteNotice] = useState<number | null>(null);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [dirty, setDirty] = useState(false);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
	const [error, setError] = useState("");
	const revision = useRef(0);
	const documentRef = useRef<ScreenplayDocument | null>(null);
	const activeFileRef = useRef("");
	const dirtyRef = useRef(false);
	const savePromiseRef = useRef<Promise<boolean> | null>(null);
	const dialogueCursorRef = useRef<{ address: ScriptNodeAddress; offset: number } | null>(null);
	const cutBlocksRef = useRef<ScriptItem[]>([]);
	const cutSelectionActionRef = useRef<() => boolean>(() => false);
	const undoActionRef = useRef<() => boolean>(() => false);
	const deleteActionRef = useRef<() => boolean>(() => false);
	const redoActionRef = useRef<() => boolean>(() => false);
	const undoStack = useRef<HistoryEntry[]>([]);
	const redoStack = useRef<HistoryEntry[]>([]);
	const lastHistoryEdit = useRef<{ key: string; at: number } | null>(null);
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
	// Speakers are derived from the blocks on the fly; characters.visible on disk is refreshed when saving.
	const screenplayCharacters = useMemo(() => document ? syncScreenplayCharacters(document).characters : null, [document]);
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

	const loadBootstrap = useCallback(() => {
		void requestJson<BootstrapResponse>("/editor-api/bootstrap").then((payload) => { setIndex(payload.index); setScreenplays(payload.screenplays); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
	}, []);
	const scriptRunner = useScriptRunner((id, exitCode) => {
		if (exitCode !== 0 || !id.startsWith("mission-")) return;
		loadBootstrap();
		setImageAssets([]);
	});

	useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

	useEffect(() => {
		const timer = window.setInterval(() => void saveCurrentDocument(), AUTO_SAVE_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [saveCurrentDocument]);

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
			if ((event.target as HTMLElement | null)?.closest("dialog[open]") || window.document.querySelector(".ui-menu:popover-open")) return;
			if (event.key === "Escape" && missionContentTocOpen) {
				event.preventDefault();
				setMissionContentTocOpen(false);
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
			if (event.key === "Delete" && !event.ctrlKey && !event.metaKey && !event.altKey) {
				if (deleteActionRef.current()) event.preventDefault();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
				if ((event.shiftKey ? redoActionRef : undoActionRef).current()) event.preventDefault();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
				if (redoActionRef.current()) event.preventDefault();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
				if (cutSelectionActionRef.current()) event.preventDefault();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
				if (pasteSelectionActionRef.current()) event.preventDefault();
				return;
			}
			if (event.key === "Shift" && !multiSelectMode && !window.document.querySelector(".source-pane:hover")) {
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
	}, [missionContentTocOpen, multiSelectMode, saveCurrentDocument, selectedBlockId, selectedNodePath]);

	async function refreshScreenplays() { setScreenplays(await requestJson<ScreenplaySummary[]>("/editor-api/screenplays")); }
	function syncHistorySize() { setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length }); }
	function resetHistory() { undoStack.current = []; redoStack.current = []; lastHistoryEdit.current = null; setDeleteNotice(null); syncHistorySize(); }
	function currentSelection(): ScriptNodeAddress | null { return selectedBlockId ? { blockId: selectedBlockId, path: selectedNodePath } : null; }
	function applyDocument(next: ScreenplayDocument) { documentRef.current = next; setDocument(next); revision.current += 1; dirtyRef.current = true; setDirty(true); setSaveState("idle"); }
	// Every user edit goes through here. coalesceKey groups rapid edits of the same field into a single undo step.
	function mutateDocument(update: (current: ScreenplayDocument) => ScreenplayDocument, coalesceKey?: string) {
		const current = documentRef.current;
		if (!current) return;
		const next = update(current);
		if (next === current) return;
		const now = Date.now();
		const previousEdit = lastHistoryEdit.current;
		const coalesce = Boolean(coalesceKey && previousEdit && previousEdit.key === coalesceKey && now - previousEdit.at < HISTORY_COALESCE_MS && undoStack.current.length);
		if (!coalesce) undoStack.current = [...undoStack.current, { document: current, selection: currentSelection() }].slice(-HISTORY_LIMIT);
		redoStack.current = [];
		lastHistoryEdit.current = coalesceKey ? { key: coalesceKey, at: now } : null;
		setDeleteNotice(null);
		applyDocument(next);
		syncHistorySize();
	}
	// Runs a pure operation from content/screenplay-ops against the latest document and selects its result.
	function applyOperation(operation: (current: ScreenplayDocument) => OperationResult | null) {
		const current = documentRef.current;
		if (!current) return false;
		const result = operation(current);
		if (!result) return false;
		exitMultiSelect(); setDialogueCursor(null);
		mutateDocument(() => result.document);
		setSelectedBlockId(result.selection?.blockId ?? null); setSelectedNodePath(result.selection?.path ?? []);
		return true;
	}
	function restoreHistory(from: typeof undoStack, to: typeof undoStack) {
		const entry = from.current.at(-1);
		const current = documentRef.current;
		if (!entry || !current) return false;
		from.current = from.current.slice(0, -1);
		to.current = [...to.current, { document: current, selection: currentSelection() }];
		lastHistoryEdit.current = null;
		exitMultiSelect(); setDialogueCursor(null); setDeleteNotice(null);
		setSelectedBlockId(entry.selection?.blockId ?? null); setSelectedNodePath(entry.selection?.path ?? []);
		applyDocument(entry.document);
		syncHistorySize();
		return true;
	}
	function undo() { return restoreHistory(undoStack, redoStack); }
	function redo() { return restoreHistory(redoStack, undoStack); }
	function recordDialogueCursor(address: ScriptNodeAddress, offset: number) {
		dialogueCursorRef.current = { address, offset };
		if (!dialogueCursor || !sameScriptAddress(dialogueCursor.address, address)) setDialogueCursor({ address, offset });
	}
	function exitMultiSelect() { setMultiSelectMode(false); setMultiSelected([]); multiSelectionChanged.current = false; scriptSelectionAnchor.current = null; }
	function toggleEditorFocusMode() {
		if (!editorFocusMode) setTitleNavigatorOpen(true);
		setEditorFocusMode(!editorFocusMode);
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
		setSelectedMission(mission); setLastMissionFile(mission.dataFile); setMissionDocument(null); setSelectedSource(new Set()); setMissionContentTocOpen(false); selectionAnchor.current = null; setError("");
		try {
			const loaded = await requestJson<MissionDocument>(`/editor-api/mission?path=${encodeURIComponent(mission.dataFile)}`);
			setMissionDocument(loaded);
		}
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}
	// Back to the mission list; the mission just viewed stays highlighted there.
	function closeMission() {
		setSelectedMission(null); setMissionDocument(null); setSelectedSource(new Set()); setMissionContentTocOpen(false); selectionAnchor.current = null;
	}
	function openMissionHeading(heading: MissionContentHeading) {
		window.document.getElementById(sourceNodeDomId(heading.path))?.scrollIntoView({ block: "start", behavior: "smooth" });
	}
	async function openSelectedBlockSource() {
		if (!selectedSourceMission) return;
		setCategoryFilter(selectedSourceMission.category);
		setLocationFilter("");
		await openMission(selectedSourceMission);
	}

	async function openScreenplay(name: string) {
		setError(""); exitMultiSelect(); setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0);
		try {
			const loaded = await requestJson<ScreenplayDocument>(`/editor-api/screenplay?name=${encodeURIComponent(name)}`);
			resetHistory(); setActiveFile(name); setDocument(loaded); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); setSaveState("idle"); revision.current = 0;
		}
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}

	async function closeScreenplay() {
		for (let attempt = 0; dirtyRef.current && attempt < 3; attempt += 1) {
			if (!await saveCurrentDocument()) return;
		}
		if (dirtyRef.current) { setError("剧本仍有尚未保存的修改，请稍后重试"); return; }
		void refreshScreenplays().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
		exitMultiSelect(); setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0); resetHistory(); setActiveFile(""); setDocument(null); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); setSaveState("idle");
	}

	async function createScreenplay() {
		const nextNumber = screenplays.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0) + 1;
		const id = String(nextNumber).padStart(3, "0"); const name = `${id}.json`;
		const now = new Date().toISOString();
		const fresh: ScreenplayDocument = { schemaVersion: 2, id, title: "", chapter: "", characters: { visible: [], hidden: [] }, createdAt: now, updatedAt: now, blocks: [] };
		try {
			const saved = await requestJson<ScreenplayDocument>(`/editor-api/screenplay?name=${encodeURIComponent(name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fresh) });
			resetHistory(); setActiveFile(name); setDocument(saved); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); setSaveState("saved"); await refreshScreenplays();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}

	function setCharacterHidden(character: string, hidden: boolean) {
		mutateDocument((current) => ({ ...current, characters: { ...current.characters, hidden: hidden ? [...current.characters.hidden, character] : current.characters.hidden.filter((item) => item !== character) } }));
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
		try { await requestJson(`/editor-api/screenplay?name=${encodeURIComponent(activeFile)}`, { method: "DELETE" }); resetHistory(); setActiveFile(""); setDocument(null); setSelectedBlockId(null); setSelectedNodePath([]); setDirty(false); await refreshScreenplays(); }
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
		if (!missionDocument || !selectedMission || (placement === "below" && !selectedNode)) return;
		const pathsWithoutDuplicateChildren = paths.filter((path) => !paths.some((candidate) => isAncestorPath(candidate, path)));
		const items: ScriptItem[] = pathsWithoutDuplicateChildren.flatMap((path) => {
			const node = nodeAtPath(missionDocument.content, path);
			if (!node || typeof path[0] !== "number") return [];
			const isChoiceOption = path.length >= 3 && path.at(-2) === "options" && typeof path.at(-1) === "number";
			const optionIsMessage = isChoiceOption && Boolean(findMessageOwner(Array.isArray(node.content) ? node.content as JsonNode[] : []));
			const expandedNodes = isChoiceOption ? expandChoiceOption(node, optionIsMessage) : expandDialogueChoices(node);
			const source = { mission: selectedMission.name, dataFile: selectedMission.dataFile, contentIndex: path[0] as number, ...(path.length > 1 ? { contentPath: path.slice(1) } : {}) };
			return expandedNodes.map((expandedNode) => ({ source, node: expandedNode }));
		});
		if (!applyOperation((current) => insertItems(current, placement === "end" ? null : currentSelection(), items, { intoContainer: false }))) return;
		setSelectedSource(new Set()); selectionAnchor.current = null;
	}

	function insertScriptNodes(nodes: JsonNode[]) {
		applyOperation((current) => insertItems(current, selectedNode ? currentSelection() : null, nodes.map((node) => ({ node })), { intoContainer: true }));
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
	function updateBlockNode(id: string, path: number[], node: JsonNode, coalesceKey?: string) { mutateDocument((current) => updateNodeAt(current, { blockId: id, path }, () => node), coalesceKey); }
	function handleScriptSelect(address: ScriptNodeAddress, shiftKey: boolean) {
		setDialogueCursor(null);
		if (!multiSelectMode && !shiftKey) {
			setSelectedBlockId(address.blockId); setSelectedNodePath(address.path); scriptSelectionAnchor.current = address; return;
		}
		if (!multiSelectMode) setMultiSelectMode(true);
		multiSelectionChanged.current = true;
		const seed = multiSelectMode ? multiSelected : selectedBlockId ? [{ blockId: selectedBlockId, path: selectedNodePath }] : [];
		const range = shiftKey && scriptSelectionAnchor.current ? siblingRange(document!, scriptSelectionAnchor.current, address) : null;
		const sameGroup = !seed.length || scriptSiblingGroup(seed[0]) === scriptSiblingGroup(address);
		const base = sameGroup ? seed : [];
		const existing = base.findIndex((candidate) => sameScriptAddress(candidate, address));
		const next = range ?? (existing >= 0 ? base.filter((_, index) => index !== existing) : [...base, address]);
		setMultiSelected(next);
		setSelectedBlockId(address.blockId); setSelectedNodePath(address.path);
		if (!shiftKey || !scriptSelectionAnchor.current || !range) scriptSelectionAnchor.current = address;
	}
	function dissolveSelectedFold() {
		if (activeScriptSelection.length !== 1) return;
		applyOperation((current) => dissolveContainer(current, activeScriptSelection[0]));
	}
	function convertSelectedFoldToMessageThread() {
		if (!selectedBlock || !selectedNode || selectedNode.type !== "fold" || activeScriptSelection.length !== 1) return;
		setDialogueCursor(null); exitMultiSelect();
		updateBlockNode(selectedBlock.id, selectedNodePath, toMessageThread(selectedNode));
	}
	function foldSelectedNodes() {
		if (canFoldSelection) applyOperation((current) => foldSiblings(current, activeScriptSelection, "折叠内容"));
	}
	function mergeSelectedDialogues() {
		if (canMergeDialogues) applyOperation((current) => mergeDialogues(current, activeScriptSelection));
	}
	function splitSelectedDialogue() {
		const latestCursor = dialogueCursorRef.current;
		if (!selectedBlock || selectedNode?.type !== "dialogue" || !dialogueCursor || !latestCursor || latestCursor.address.blockId !== selectedBlock.id || !sameNumberPath(latestCursor.address.path, selectedNodePath)) return false;
		return applyOperation((current) => splitDialogue(current, latestCursor.address, latestCursor.offset));
	}
	// Wraps (or unwraps) the text selected in the focused inline field with the strikethrough marker.
	function toggleStrikeOnSelection() {
		const field = window.document.activeElement;
		if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) || !field.closest(".script-blocks")) return;
		const { selectionStart: start, selectionEnd: end, value } = field;
		if (start === null || end === null || start === end) return;
		const selected = value.slice(start, end);
		const selectedInner = selected.startsWith("{{") && selected.endsWith("}}") ? strikeMarkerBody(selected.slice(2, -2)) : null;
		const surrounded = value.slice(start - 4, start) === "{{~~" && value.slice(end, end + 4) === "~~}}";
		const [rangeStart, rangeEnd, replacement] = selectedInner !== null ? [start, end, selectedInner] : surrounded ? [start - 4, end + 4, selected] : [start, end, wrapStrikeMarker(selected)];
		const innerStart = selectedInner === null && !surrounded ? rangeStart + 4 : rangeStart;
		const innerLength = selectedInner ?? selected;
		field.setRangeText(replacement, rangeStart, rangeEnd);
		field.setSelectionRange(innerStart, innerStart + innerLength.length);
		// setRangeText bypasses React's value tracking, so the input event is picked up as a normal onChange.
		field.dispatchEvent(new Event("input", { bubbles: true }));
	}
	function deleteSelectedNode() {
		const deleteCount = activeScriptSelection.length;
		if (!applyOperation((current) => removeSiblings(current, activeScriptSelection))) return false;
		setDeleteNotice(deleteCount);
		return true;
	}
	// Right-clicking outside the current selection selects that block first, like a file manager.
	function openBlockContextMenu(address: ScriptNodeAddress, position: { x: number; y: number }) {
		if (!activeScriptSelection.some((candidate) => sameScriptAddress(candidate, address))) {
			exitMultiSelect(); setDialogueCursor(null);
			setSelectedBlockId(address.blockId); setSelectedNodePath(address.path);
		}
		setContextMenu(position);
	}
	function cutSelectedBlocks() {
		let clipboard: ScriptItem[] = [];
		const cut = applyOperation((current) => {
			const result = cutSiblings(current, activeScriptSelection);
			if (result) clipboard = result.clipboard;
			return result?.result ?? null;
		});
		if (cut) cutBlocksRef.current = clipboard;
		return cut;
	}
	function pasteCutBlocks() {
		if (!selectedNode || !cutBlocksRef.current.length) return false;
		return applyOperation((current) => insertItems(current, currentSelection(), cutBlocksRef.current, { intoContainer: false }));
	}
	function moveScriptNode(targetAddress: ScriptNodeAddress, draggedAddress: ScriptNodeAddress, nest: boolean) {
		applyOperation((current) => moveNode(current, targetAddress, draggedAddress, nest));
	}

	useEffect(() => {
		cutSelectionActionRef.current = cutSelectedBlocks;
		undoActionRef.current = undo;
		deleteActionRef.current = deleteSelectedNode;
		redoActionRef.current = redo;
		pasteSelectionActionRef.current = pasteCutBlocks;
		splitDialogueActionRef.current = splitSelectedDialogue;
	});

	const singleSelection = activeScriptSelection.length === 1;
	const contextActions = ([
		canFoldSelection && { label: "创建折叠组", onClick: foldSelectedNodes },
		singleSelection && isContainerNode(selectedNode) && { label: "拆散内容组", onClick: dissolveSelectedFold },
		canMergeDialogues && { label: "合并对话", onClick: mergeSelectedDialogues },
		singleSelection && selectedNode?.type === "dialogue" && { label: "在光标处拆分对话", shortcut: "Ctrl+K", disabled: !canSplitDialogue, onClick: () => { splitSelectedDialogue(); } },
		singleSelection && selectedNode?.type === "image" && { label: "替换图片…", onClick: () => void openImagePicker("replace") },
	] as Array<MenuItem | false>).filter((item): item is MenuItem => Boolean(item));
	const selectedNodes = document ? activeScriptSelection.map((address) => nodeAtAddress(document, address)) : [];
	const convertActions: MenuItem[] = [
		...(selectedNodes.length && selectedNodes.every(isConvertibleTextNode)
			? convertibleTextTypes.filter((type) => !selectedNodes.every((node) => node?.type === type)).map((type) => ({ label: nodeLabels[type], onClick: () => { applyOperation((current) => convertTextNodes(current, activeScriptSelection, type)); } }))
			: []),
		...(singleSelection && selectedNode?.type === "fold" ? [{ label: nodeLabels["message-thread"], onClick: convertSelectedFoldToMessageThread }] : []),
		...(singleSelection && selectedNode?.type === "message-thread" ? [{ label: nodeLabels.fold, onClick: () => { applyOperation((current) => messageThreadToFold(current, activeScriptSelection[0])); } }] : []),
	];
	const scriptContextItems: MenuEntry[] = [
		{ label: "剪切", shortcut: "Ctrl+X", onClick: () => { cutSelectedBlocks(); } },
		{ label: "粘贴到后面", shortcut: "Ctrl+V", disabled: !singleSelection || !cutBlocksRef.current.length, onClick: () => { pasteCutBlocks(); } },
		...(contextActions.length ? ["separator" as const, ...contextActions] : []),
		...(convertActions.length ? ["separator" as const, { heading: "转换为" }, ...convertActions] : []),
		"separator",
		{ label: activeScriptSelection.length > 1 ? `删除 ${activeScriptSelection.length} 个内容块` : "删除", shortcut: "Delete", danger: true, onClick: () => { deleteSelectedNode(); } },
	];
	const closeContextMenu = useCallback(() => setContextMenu(null), []);

	const missionBrowserProps: Omit<MissionBrowserProps, "onOpen"> = {
		groups: missionGroups,
		selectedFile: lastMissionFile,
		search: missionFilter,
		category: categoryFilter,
		location: locationFilter,
		categories: missionCategories,
		locations: missionLocations,
		onSearchChange: setMissionFilter,
		onCategoryChange: (value) => { setCategoryFilter(value); setLocationFilter(""); },
		onLocationChange: setLocationFilter,
	};

	return (
		<div className={`app-shell ${editorFocusMode ? "is-editor-focus" : ""}`}>
			<ImportDialog opened={importOpened} mode={importMode} text={importText} loading={importLoading} onClose={() => setImportOpened(false)} onModeChange={setImportMode} onTextChange={setImportText} onImportPlain={importScriptLines} onImportSrt={importSrt} onImportSource={() => void importWikitext()} />
			<ContextMenu position={contextMenu} items={scriptContextItems} onClose={closeContextMenu} />
			<SettingsDialog opened={settingsOpen} runner={scriptRunner} onClose={() => setSettingsOpen(false)} />
			<ImagePickerDialog mode={imagePickerMode} search={imageSearch} assets={filteredImageAssets} total={imageAssets.length} loading={imageLoading} onClose={() => setImagePickerMode(null)} onSearchChange={setImageSearch} onChoose={chooseImage} />
			<aside className="app-sidebar">
				<div className="app-panel">
					<div className="brand"><h1>剧本编辑器</h1><p>星穹铁道任务素材 · 剧本编排工作台</p></div>
					<div className={`save-indicator ${saveState}`} title="每 10 秒自动保存；按 Ctrl+S 可立即保存"><span />{!activeFile ? "未打开剧本" : saveState === "saving" ? "正在保存…" : saveState === "error" ? "保存失败" : dirty ? "等待自动保存" : "已保存到本地"}</div>
					<div className="app-panel-actions"><Button variant={editorFocusMode ? "filled" : "light"} size="sm" onClick={toggleEditorFocusMode}>{editorFocusMode ? "退出专注模式" : "专注模式"}</Button><Tooltip label="设置"><IconButton aria-label="打开设置" size="md" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(true)}><IconSettings /></IconButton></Tooltip></div>
				</div>
			</aside>
			{error ? <div className="error-banner"><span>{error}</span><Button variant="subtle" color="red" size="xs" onClick={() => setError("")}>关闭</Button></div> : null}
			<main className="workspace">
				<section className="source-pane">
					<div className="source-preview">
						{selectedMission ? <>
							<header className="preview-header">
								<IconButton className="back-to-library" size="lg" aria-label="返回任务列表" title="返回任务列表" onClick={closeMission}><IconArrowLeft size={19} /></IconButton>
								<div className="preview-heading"><span className="eyebrow">{selectedMission.category} / {selectedMission.location}</span><h2>{selectedMission.name}</h2><p>{selectedMission.series}</p></div>
								<div className="preview-header-side"><div className="preview-navigation">
									<Tooltip label="当前任务内容目录"><IconButton className="mission-toc-trigger" aria-label="打开当前任务内容目录" variant={missionContentTocOpen ? "light" : "outline"} color="blue" size="md" aria-pressed={missionContentTocOpen} onClick={() => setMissionContentTocOpen((current) => !current)}><IconListTree /></IconButton></Tooltip>
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
						</> : <div className="mission-library">
							<header className="library-header"><h2>任务资料库</h2><Badge color="blue" size="lg">{filteredMissions.length} 个任务</Badge></header>
							<MissionBrowser {...missionBrowserProps} onOpen={(mission) => void openMission(mission)} />
						</div>}
					</div>
				</section>
				<section className="script-pane">
					{document ? <div className="script-editor">
						<ScreenplayMetaPanel document={document} characters={screenplayCharacters ?? document.characters} activeFile={activeFile} onBack={() => void closeScreenplay()} onTitleChange={(value) => mutateDocument((current) => ({ ...current, title: value }), "meta:title")} onChapterChange={(value) => mutateDocument((current) => ({ ...current, chapter: value }), "meta:chapter")} onCharacterHiddenChange={setCharacterHidden} onDelete={() => void deleteScreenplay()} />
						<div className={`script-editor-workspace ${titleNavigatorOpen ? "has-title-navigator" : ""}`}>
							<aside className="script-title-navigator" aria-hidden={!titleNavigatorOpen} inert={!titleNavigatorOpen ? true : undefined}><header className="script-title-navigator-heading"><span>章节目录</span><small>{scriptTitles.length} 个章节标题</small></header><nav>{scriptTitles.length ? scriptTitles.map((entry) => <Button key={`${entry.blockId}-${entry.path.join("-")}`} variant="subtle" color="gray" size="sm" className={selectedBlockId === entry.blockId && sameNumberPath(selectedNodePath, entry.path) ? "is-active" : ""} style={{ paddingLeft: `${12 + Math.min(entry.depth, 4) * 12}px` }} onClick={() => navigateToScriptTitle(entry)} title={entry.title}>{entry.title}</Button>) : <p>当前剧本没有章节标题</p>}</nav></aside>
							<div className="script-editor-main">
						<div className={`block-toolbar ${multiSelectMode ? "is-multi-select" : ""}`}>
							<div className="block-toolbar-actions toolbar-main-actions">
								<div className="toolbar-action-group is-navigation"><Tooltip label={titleNavigatorOpen ? "关闭章节目录" : "打开章节目录"}><IconButton variant={titleNavigatorOpen ? "light" : "subtle"} color="blue" size="md" aria-label={titleNavigatorOpen ? "关闭章节目录" : "打开章节目录"} aria-pressed={titleNavigatorOpen} onClick={() => setTitleNavigatorOpen((current) => !current)}><IconListTree size={16} /></IconButton></Tooltip></div>
								<div className="toolbar-action-group"><Tooltip label="撤销（Ctrl+Z）"><IconButton size="sm" color="default" aria-label="撤销" disabled={!historySize.undo} onClick={undo}><IconArrowBackUp /></IconButton></Tooltip><Tooltip label="重做（Ctrl+Y）"><IconButton size="sm" color="default" aria-label="重做" disabled={!historySize.redo} onClick={redo}><IconArrowForwardUp /></IconButton></Tooltip></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">插入</span><Button variant="subtle" size="sm" onClick={() => insertScriptNode("dialogue")}>对话</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("narration")}>叙述</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("section")}>章节标题</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("divider")}>分割线</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("text")}>普通文本</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("note")}>编辑注释</Button><Button variant="subtle" size="sm" onClick={() => insertScriptNode("fold")}>折叠内容</Button></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">格式</span><Tooltip label="为选中的文字添加或移除删除线：{{~~文字~~}}"><Button className="strike-format-button" variant="subtle" size="sm" disabled={multiSelectMode || !editableAddress} onMouseDown={(event) => event.preventDefault()} onClick={toggleStrikeOnSelection}>删除线</Button></Tooltip></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">导入</span><Button variant="subtle" size="sm" onClick={() => setImportOpened(true)}>批量导入</Button></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">图片</span><Button variant="subtle" size="sm" onClick={() => void openImagePicker("add")}>插入图片</Button></div>
								<div className="toolbar-action-group"><span className="toolbar-group-label">工具</span><MenuButton label="批量工具" align="end" active={Boolean(searchMode)} items={[{ label: "统一主角名为“穹”", onClick: convertTrailblazerSpeakers }, { label: "检查性别指代", onClick: () => toggleScriptSearch("gender") }, { label: "查找主角称谓", onClick: () => toggleScriptSearch("trailblazer-reference") }]} /></div>
							</div>
							{multiSelectMode ? <div className="toolbar-selection multi-selection-status"><Badge variant="filled" color="blue" size="sm">多选</Badge><span>{multiSelected.length ? `已选择 ${multiSelected.length} 个同级内容块` : "点击内容块开始选择"} · Esc 退出</span></div> : <span className="toolbar-hint">右键内容块查看更多操作 · Shift 多选 · Delete 删除</span>}
						</div>
						{deleteNotice ? <div className="delete-notice" role="status"><span>已删除 {deleteNotice} 个内容块</span><Button variant="subtle" color="red" size="xs" onClick={undo}>撤销</Button><IconButton aria-label="关闭提示" color="red" size="xs" onClick={() => setDeleteNotice(null)}><IconX /></IconButton></div> : null}
							{searchMode ? <div className="script-search-bar"><strong>{searchMode === "gender" ? "性别指代检查" : "主角称谓查找"}</strong><span className="script-search-term">{activeSearchMatch ? `“${activeSearchMatch.term}”` : "没有找到匹配内容"}</span><span className="script-search-count">{searchMatches.length ? `${normalizedSearchIndex + 1} / ${searchMatches.length}` : "0 / 0"}</span><Button variant="subtle" size="xs" onClick={() => navigateScriptSearch(-1)}>上一个</Button><Button variant="subtle" size="xs" onClick={() => navigateScriptSearch(1)}>下一个</Button>{searchMode === "gender" ? <Button size="xs" disabled={!activeSearchMatch?.replacement} onClick={replaceCurrentGenderMatch}>替换为“{activeSearchMatch?.replacement ?? "—"}”</Button> : null}<Button variant="subtle" color="gray" size="xs" onClick={() => { setSearchMode(null); setSearchMatches([]); setSearchMatchIndex(0); }}>关闭</Button></div> : null}
						<div className="script-blocks">{document.blocks.length ? document.blocks.map((block) => <ScriptBlockView key={block.id} block={block} selectedAddresses={activeScriptSelection} editableAddress={editableAddress} activeMatch={activeSearchMatch} onSelect={handleScriptSelect} onChange={(path, node) => updateBlockNode(block.id, path, node, `edit:${block.id}:${path.join(".")}`)} onDrop={moveScriptNode} onDialogueCursor={recordDialogueCursor} onContextMenu={openBlockContextMenu} />) : <div className="empty-script"><span>＋</span><h3>这个剧本还是空的</h3><p>从左侧加入任务内容，或通过上方工具栏插入内容。</p></div>}</div>
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
