export type JsonNode = Record<string, unknown> & { type?: string };

export interface MissionEntry {
	name: string;
	link: string;
	sourceFile?: string;
	dataFile?: string;
	children?: MissionEntry[];
}

export type MissionIndex = Record<string, Record<string, MissionEntry[]>>;

export interface MissionRef extends MissionEntry {
	category: string;
	location: string;
	series: string;
	dataFile: string;
}

export interface MissionDocument {
	mission: Record<string, unknown> & { name?: string };
	content: JsonNode[];
	source?: Record<string, unknown>;
}

export interface ScriptBlock {
	id: string;
	source?: {
		mission: string;
		dataFile: string;
		contentIndex: number;
		contentPath?: Array<string | number>;
	};
	node: JsonNode;
}

/** A block as it moves between sibling lists (clipboard, insertion); top-level blocks get an id when placed. */
export type ScriptItem = Omit<ScriptBlock, "id"> & { id?: string };
export type NodePath = Array<string | number>;

export interface ScriptNodeAddress {
	blockId: string;
	path: number[];
}

export interface ScriptTitleEntry extends ScriptNodeAddress {
	title: string;
	depth: number;
}

export type SearchMode = "gender" | "trailblazer-reference";

export interface ScriptTextMatch {
	address: ScriptNodeAddress;
	field: "text" | "title" | "content" | "subtitle";
	start: number;
	end: number;
	term: string;
	replacement?: string;
}

export interface SelectionModifiers {
	shiftKey?: boolean;
	additive?: boolean;
	forceSelect?: boolean;
	forceDeselect?: boolean;
}

export interface ScreenplayDocument {
	schemaVersion: 2;
	id: string;
	title: string;
	chapter: string;
	characters: {
		visible: string[];
		hidden: string[];
	};
	createdAt: string;
	updatedAt: string;
	blocks: ScriptBlock[];
}

export interface ScreenplaySummary {
	name: string;
	id: string;
	title: string;
	chapter: string;
	characters: string[];
	blockCount: number;
	characterCount: number;
	updatedAt: string;
	invalid?: boolean;
}

export interface BootstrapResponse {
	index: MissionIndex;
	screenplays: ScreenplaySummary[];
}

export interface ImageAsset {
	file: string;
	asset: string;
	mime: string;
	bytes: number;
}
