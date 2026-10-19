export type ParsedWikitextNode = Record<string, unknown> & { type?: string };

export function parseBlocks(input: string): ParsedWikitextNode[];
export function parseStarRailMission(input: string, sourceMetadata?: Record<string, unknown>): {
	content: ParsedWikitextNode[];
	[key: string]: unknown;
};
