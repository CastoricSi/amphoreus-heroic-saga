function findRubyMarkerEnd(text: string, start: number) {
	let depth = 0;
	for (let index = start; index < text.length - 1; index += 1) {
		if (text.startsWith("{{", index)) { depth += 1; index += 1; continue; }
		if (text.startsWith("}}", index)) {
			depth -= 1;
			if (depth === 0) return index + 2;
			index += 1;
		}
	}
	return -1;
}

function splitRubyMarker(body: string) {
	let depth = 0;
	for (let index = 0; index < body.length; index += 1) {
		if (body.startsWith("{{", index)) { depth += 1; index += 1; continue; }
		if (body.startsWith("}}", index) && depth > 0) { depth -= 1; index += 1; continue; }
		if (body[index] === "|" && depth === 0) return [body.slice(0, index), body.slice(index + 1)] as const;
	}
	return null;
}

export function plainRubyText(text: string): string {
	let output = "";
	let cursor = 0;
	while (cursor < text.length) {
		const start = text.indexOf("{{", cursor);
		if (start < 0) return output + text.slice(cursor);
		output += text.slice(cursor, start);
		const end = findRubyMarkerEnd(text, start);
		if (end < 0) return output + text.slice(start);
		const parts = splitRubyMarker(text.slice(start + 2, end - 2));
		output += parts ? plainRubyText(parts[0]) : text.slice(start, end);
		cursor = end;
	}
	return output;
}

export function collectRubyAnnotations(text: string) {
	const annotations: string[] = [];
	let cursor = 0;
	while (cursor < text.length) {
		const start = text.indexOf("{{", cursor);
		if (start < 0) break;
		const end = findRubyMarkerEnd(text, start);
		if (end < 0) break;
		const parts = splitRubyMarker(text.slice(start + 2, end - 2));
		if (parts) {
			annotations.push(plainRubyText(parts[1]));
			annotations.push(...collectRubyAnnotations(parts[0]), ...collectRubyAnnotations(parts[1]));
		}
		cursor = end;
	}
	return annotations.filter(Boolean);
}

export { findRubyMarkerEnd, splitRubyMarker };
