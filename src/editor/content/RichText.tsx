import type { ReactNode } from "react";
import { findRubyMarkerEnd, splitRubyMarker } from "./rich-text-utils";

function markdownLinkAt(text: string, start: number) {
	if (text[start] !== "[") return null;
	const labelEnd = text.indexOf("](", start + 1);
	if (labelEnd < 0) return null;
	let depth = 1;
	let cursor = labelEnd + 2;
	for (; cursor < text.length; cursor += 1) {
		if (text[cursor] === "(") depth += 1;
		else if (text[cursor] === ")") {
			depth -= 1;
			if (depth === 0) break;
		}
	}
	if (depth !== 0) return null;
	const url = text.slice(labelEnd + 2, cursor);
	if (!/^https?:\/\/\S+$/iu.test(url)) return null;
	return { start, end: cursor + 1, label: text.slice(start + 1, labelEnd), url };
}

function nextMarkdownLink(text: string, from: number) {
	for (let start = text.indexOf("[", from); start >= 0; start = text.indexOf("[", start + 1)) {
		const link = markdownLinkAt(text, start);
		if (link) return link;
	}
	return null;
}

export function InlineRubyText({ text }: { text: string }) {
	const output: ReactNode[] = [];
	let cursor = 0;
	while (cursor < text.length) {
		const rubyStart = text.indexOf("{{", cursor);
		const link = nextMarkdownLink(text, cursor);
		if (link && (rubyStart < 0 || link.start < rubyStart)) {
			if (link.start > cursor) output.push(text.slice(cursor, link.start));
			output.push(<a className="inline-link" href={link.url} target="_blank" rel="noreferrer" key={`link-${link.start}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><InlineRubyText text={link.label} /></a>);
			cursor = link.end;
			continue;
		}
		if (rubyStart < 0) { output.push(text.slice(cursor)); break; }
		if (rubyStart > cursor) output.push(text.slice(cursor, rubyStart));
		const end = findRubyMarkerEnd(text, rubyStart);
		if (end < 0) { output.push(text.slice(rubyStart)); break; }
		const parts = splitRubyMarker(text.slice(rubyStart + 2, end - 2));
		if (!parts) output.push(text.slice(rubyStart, end));
		else output.push(<ruby className="inline-ruby" key={`${rubyStart}-${end}`}><InlineRubyText text={parts[0]} /><rt><InlineRubyText text={parts[1]} /></rt></ruby>);
		cursor = end;
	}
	return <>{output}</>;
}

export function HighlightedRichText({ text, highlight }: { text: string; highlight?: { start: number; end: number } }) {
	if (!highlight || highlight.start < 0 || highlight.end <= highlight.start) return <InlineRubyText text={text} />;
	return <><InlineRubyText text={text.slice(0, highlight.start)} /><mark className="search-match-highlight"><InlineRubyText text={text.slice(highlight.start, highlight.end)} /></mark><InlineRubyText text={text.slice(highlight.end)} /></>;
}
