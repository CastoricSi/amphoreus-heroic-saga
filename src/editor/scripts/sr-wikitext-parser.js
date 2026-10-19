const HTML_ENTITIES = new Map([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&nbsp;", " "],
]);

function normalizeSource(value) {
  return value.replace(/\r\n?/g, "\n").replaceAll("•", "·");
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => HTML_ENTITIES.get(entity) ?? entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function scanBalanced(text, start, open, close) {
  if (!text.startsWith(open, start)) return null;

  let depth = 0;
  for (let index = start; index < text.length; ) {
    if (text.startsWith(open, index)) {
      depth += 1;
      index += open.length;
      continue;
    }
    if (text.startsWith(close, index)) {
      depth -= 1;
      index += close.length;
      if (depth === 0) {
        return { raw: text.slice(start, index), end: index };
      }
      continue;
    }
    index += 1;
  }
  return null;
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let start = 0;
  let templateDepth = 0;
  let linkDepth = 0;
  const protectedTags = [];

  for (let index = 0; index < text.length; ) {
    const openingTag = text.slice(index).match(/^<(tabber|tabs|nowiki)\b[^>]*>/i);
    if (openingTag) {
      protectedTags.push(openingTag[1].toLowerCase());
      index += openingTag[0].length;
      continue;
    }
    const closingTag = text.slice(index).match(/^<\/(tabber|tabs|nowiki)\s*>/i);
    if (closingTag) {
      const tag = closingTag[1].toLowerCase();
      const stackIndex = protectedTags.lastIndexOf(tag);
      if (stackIndex !== -1) protectedTags.splice(stackIndex, 1);
      index += closingTag[0].length;
      continue;
    }
    if (protectedTags.length) {
      index += 1;
      continue;
    }
    if (text.startsWith("{{", index)) {
      templateDepth += 1;
      index += 2;
      continue;
    }
    if (text.startsWith("}}", index) && templateDepth > 0) {
      templateDepth -= 1;
      index += 2;
      continue;
    }
    if (text.startsWith("[[", index)) {
      linkDepth += 1;
      index += 2;
      continue;
    }
    if (text.startsWith("]]", index) && linkDepth > 0) {
      linkDepth -= 1;
      index += 2;
      continue;
    }
    if (text[index] === delimiter && templateDepth === 0 && linkDepth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  parts.push(text.slice(start));
  return parts;
}

function findTopLevelEquals(text) {
  let templateDepth = 0;
  let linkDepth = 0;
  const protectedTags = [];
  for (let index = 0; index < text.length; ) {
    const openingTag = text.slice(index).match(/^<(tabber|tabs|nowiki)\b[^>]*>/i);
    if (openingTag) {
      protectedTags.push(openingTag[1].toLowerCase());
      index += openingTag[0].length;
      continue;
    }
    const closingTag = text.slice(index).match(/^<\/(tabber|tabs|nowiki)\s*>/i);
    if (closingTag) {
      const tag = closingTag[1].toLowerCase();
      const stackIndex = protectedTags.lastIndexOf(tag);
      if (stackIndex !== -1) protectedTags.splice(stackIndex, 1);
      index += closingTag[0].length;
      continue;
    }
    if (protectedTags.length) {
      index += 1;
      continue;
    }
    if (text.startsWith("{{", index)) {
      templateDepth += 1;
      index += 2;
      continue;
    }
    if (text.startsWith("}}", index) && templateDepth > 0) {
      templateDepth -= 1;
      index += 2;
      continue;
    }
    if (text.startsWith("[[", index)) {
      linkDepth += 1;
      index += 2;
      continue;
    }
    if (text.startsWith("]]", index) && linkDepth > 0) {
      linkDepth -= 1;
      index += 2;
      continue;
    }
    if (text[index] === "=" && templateDepth === 0 && linkDepth === 0) return index;
    index += 1;
  }
  return -1;
}

function parseTemplate(raw) {
  const inner = raw.startsWith("{{") && raw.endsWith("}}") ? raw.slice(2, -2) : raw;
  const pieces = splitTopLevel(inner, "|");
  const name = pieces.shift()?.trim() ?? "";
  const positional = [];
  const named = {};

  for (const piece of pieces) {
    const equals = findTopLevelEquals(piece);
    if (equals === -1) {
      positional.push(piece.trim());
      continue;
    }
    const key = piece.slice(0, equals).trim();
    named[key] = piece.slice(equals + 1).trim();
  }

  return { name, positional, named, raw };
}

function templateToInline(template) {
  const { name, positional, named } = template;
  if (name === "颜色") return cleanInline(positional.at(-1) ?? "");
  if (name === "图标") {
    const [item = "", amount] = positional;
    return amount ? `${cleanInline(item)} × ${cleanInline(amount)}` : cleanInline(item);
  }
  if (name === "注音") {
    const base = cleanInline(positional[0] ?? "");
    const annotation = cleanInline(positional[1] ?? "");
    return annotation ? `{{${base}|${annotation}}}` : base;
  }
  if (name === "黑幕") return cleanInline(positional[0] ?? "");
  if (name === "ruby") {
    const base = cleanInline(positional[0] ?? "");
    const annotation = cleanInline(positional[1] ?? "");
    return annotation ? `{{${base}|${annotation}}}` : base;
  }
  if (name === "梗") return cleanInline(positional[0] ?? "");
  if (named.内容) return cleanInline(named.内容);
  // 未适配的内联模板通常把正文放在第一个位置参数，后续参数是注释、样式或尺寸。
  // 只取第一个参数，避免把脚注说明意外拼进任务名称等字段。
  return cleanInline(positional[0] ?? "");
}

function inlineImageReferences(value) {
  return [...String(value ?? "").matchAll(/\[\[(?:File|文件):\s*([^|\]\n]+)((?:\|[^\]]*)*)\]\]/giu)].map((match) => {
    const options = match[2].split("|").map((option) => option.trim()).filter(Boolean);
    const width = options.find((option) => /^\d+px$/iu.test(option)) ?? "";
    return { file: match[1].trim(), ...(width ? { displayWidth: width } : {}) };
  });
}

export function cleanInline(input) {
  let text = String(input ?? "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<ruby[^>]*>([\s\S]*?)<\/ruby>/gi, (_, content) =>
    content.replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, "").replace(/<[^>]+>/g, ""),
  );

  let output = "";
  for (let index = 0; index < text.length; ) {
    if (text.startsWith("{{", index)) {
      const balanced = scanBalanced(text, index, "{{", "}}");
      if (balanced) {
        output += templateToInline(parseTemplate(balanced.raw));
        index = balanced.end;
        continue;
      }
    }
    if (text.startsWith("[[", index)) {
      const balanced = scanBalanced(text, index, "[[", "]]");
      if (balanced) {
        const parts = splitTopLevel(balanced.raw.slice(2, -2), "|");
        if (!/^(?:File|文件):/iu.test(parts[0]?.trim() ?? "")) output += parts.at(-1)?.trim() ?? "";
        index = balanced.end;
        continue;
      }
    }
    if (text[index] === "[") {
      const externalLink = text.slice(index).match(/^\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+?))?\]/i);
      if (externalLink) {
        const url = decodeHtmlEntities(externalLink[1]);
        const label = cleanInline(externalLink[2] ?? url);
        output += `[${label}](${url})`;
        index += externalLink[0].length;
        continue;
      }
    }
    output += text[index];
    index += 1;
  }

  return decodeHtmlEntities(output)
    .replace(/<[^>]+>/g, "")
    .replace(/'''?/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseList(value) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*[#*]+\s*/, "").trim())
    .filter(Boolean)
    .map(cleanInline);
}

function parseRewards(value) {
  const rewards = [];
  for (let index = 0; index < value.length; ) {
    const opening = value.indexOf("{{", index);
    if (opening === -1) break;
    const balanced = scanBalanced(value, opening, "{{", "}}");
    if (!balanced) break;
    const template = parseTemplate(balanced.raw);
    if (template.name === "图标") {
      const [item = "", amount = null] = template.positional;
      rewards.push({ item: cleanInline(item), amount: amount === null ? null : cleanInline(amount) });
    }
    index = balanced.end;
  }
  return rewards;
}

function parseMissionMetadata(template) {
  const fields = template.named;
  const known = new Set([
    "任务名称", "任务地区", "任务类型", "所属版本", "任务描述", "奖励", "任务条件", "开放等级",
    "出场人物", "相关道具", "系列任务", "任务编号", "前置任务", "后续任务", "任务流程", "剧情梗概",
  ]);
  const extra = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!known.has(key)) extra[key] = cleanInline(value);
  }

  return {
    name: cleanInline(fields.任务名称),
    region: cleanInline(fields.任务地区),
    type: cleanInline(fields.任务类型),
    version: cleanInline(fields.所属版本),
    number: cleanInline(fields.任务编号),
    series: cleanInline(fields.系列任务),
    description: cleanInline(fields.任务描述),
    requirements: cleanInline(fields.任务条件),
    requiredLevel: cleanInline(fields.开放等级),
    characters: cleanInline(fields.出场人物).split(/[、，,]/).map((item) => item.trim()).filter(Boolean),
    relatedItems: cleanInline(fields.相关道具).split(/[、，,]/).map((item) => item.trim()).filter(Boolean),
    rewards: parseRewards(fields.奖励 ?? ""),
    previousMissions: parseList(fields.前置任务 ?? ""),
    nextMissions: parseList(fields.后续任务 ?? ""),
    objectives: parseList(fields.任务流程 ?? ""),
    synopsis: parseList(fields.剧情梗概 ?? ""),
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}

function findTopLevelTemplate(source, expectedName) {
  for (let index = 0; index < source.length; ) {
    const opening = source.indexOf("{{", index);
    if (opening === -1) return null;
    const balanced = scanBalanced(source, opening, "{{", "}}");
    if (!balanced) return null;
    const template = parseTemplate(balanced.raw);
    if (template.name === expectedName) return template;
    index = balanced.end;
  }
  return null;
}

function choiceNode(template) {
  const numbers = new Set();
  for (const key of Object.keys(template.named)) {
    const match = key.match(/^(?:选项|剧情)(\d+)$/);
    if (match) numbers.add(Number(match[1]));
  }

  const options = [...numbers]
    .sort((a, b) => a - b)
    .filter((number) => template.named[`选项${number}`] !== undefined)
    .map((number) => ({
      id: number,
      text: cleanInline(template.named[`选项${number}`]),
      content: parseBlocks(template.named[`剧情${number}`] ?? ""),
    }));

  return {
    type: "choice",
    presentation: template.name === "短信选项" ? "message" : "dialogue",
    options,
  };
}

function splitMessageThreadTitle(value) {
  const lines = String(value ?? "").split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  return {
    title: (lines.shift() ?? "").replace(/^短信\s*[：:]\s*/u, "").trim(),
    subtitle: lines.join(" "),
  };
}

function findMessageOwner(nodes) {
  for (const node of nodes) {
    if (node?.type === "message" && node.side === "right" && node.speaker) return node.speaker;
    if (Array.isArray(node?.content)) {
      const owner = findMessageOwner(node.content);
      if (owner) return owner;
    }
    if (Array.isArray(node?.options)) {
      for (const option of node.options) {
        const owner = findMessageOwner(Array.isArray(option.content) ? option.content : []);
        if (owner) return owner;
      }
    }
  }
  return "";
}

function templateNode(template) {
  if (template.name === "剧情选项" || template.name === "短信选项") return choiceNode(template);
  if (template.name === "折叠" || template.name === "折叠框") {
    const rawTitle = cleanInline(template.named.标题 ?? template.positional[0]);
    const content = parseBlocks(template.named.内容 ?? template.positional[1] ?? "");
    if (/^短信\s*[：:]/u.test(rawTitle) && findMessageOwner(content)) {
      return {
        type: "message-thread",
        ...splitMessageThreadTitle(rawTitle),
        owner: findMessageOwner(content) || "开拓者",
        collapsed: (template.named.折叠 ?? "").trim() === "是",
        content,
      };
    }
    return {
      type: "fold",
      title: rawTitle,
      collapsed: (template.named.折叠 ?? "").trim() === "是",
      content,
    };
  }
  if (template.name === "任务描述") {
    return {
      type: "objective-description",
      text: cleanInline(template.positional[0] ?? template.named.内容),
      location: cleanInline(template.positional[1] ?? template.named.地点),
    };
  }
  if (template.name === "颜色") {
    const rawText = template.positional.at(-1) ?? "";
    const images = inlineImageReferences(rawText);
    return {
      type: "narration",
      tone: cleanInline(template.positional[0]),
      text: cleanInline(rawText),
      ...(images.length ? { images } : {}),
    };
  }
  if (template.name === "提示") {
    return {
      type: "note",
      tone: cleanInline(template.positional[0]),
      text: cleanInline(template.positional[1]),
      ...(template.positional[2] ? { context: cleanInline(template.positional[2]) } : {}),
    };
  }
  if (template.name === "提示消息") {
    return {
      type: "notice",
      tone: cleanInline(template.positional[0]),
      text: cleanInline(template.positional[1]),
    };
  }
  if (template.name === "角色对话") {
    const [side, speaker, contentType, value, acknowledged] = template.positional;
    if (side === "模板开始") {
      return { type: "message-thread-start", title: cleanInline(speaker), subtitle: cleanInline(contentType) };
    }
    if (side === "模板结束") return { type: "message-thread-end" };
    const structuredContent = contentType === "文本" && /^\s*\{\{/.test(value ?? "")
      ? parseBlocks(value)
      : null;
    const cleanedValue = cleanInline(value);
    const normalizedContentType = contentType === "图片" ? "image" : contentType === "表情" ? "sticker" : "text";
    return {
      type: "message",
      side: side === "左" ? "left" : side === "右" ? "right" : cleanInline(side),
      speaker: cleanInline(speaker),
      contentType: normalizedContentType,
      ...(contentType === "图片"
        ? { image: cleanedValue, file: cleanedValue }
        : contentType === "表情"
          ? { sticker: cleanedValue, file: `聊天表情-${cleanedValue}.png` }
        : structuredContent?.length
          ? { content: structuredContent }
          : { text: cleanedValue }),
      ...(acknowledged ? { acknowledged: cleanInline(acknowledged) === "是" } : {}),
    };
  }
  if (template.name === "短信警告") {
    return { type: "message-system", text: cleanInline(template.positional[0]) };
  }
  if (template.name === "事件") {
    return {
      type: "event",
      category: cleanInline(template.positional[0]),
      name: cleanInline(template.positional[1]),
      text: cleanInline(template.positional[2]),
    };
  }
  if (template.name === "图片放大") {
    return {
      type: "image",
      file: cleanInline(template.positional[0]),
      displayWidth: cleanInline(template.positional[1]),
      fullWidth: cleanInline(template.positional[2]),
    };
  }
  if (template.name === "黑幕") {
    return { type: "spoiler", text: cleanInline(template.positional[0]) };
  }
  if (template.name === "梗") {
    return {
      type: "annotation",
      text: cleanInline(template.positional[0]),
      category: cleanInline(template.positional[1]),
      note: cleanInline(template.positional[2]),
    };
  }
  if (template.name.startsWith("#css:")) {
    return { type: "style", css: template.name.slice(5).trim() };
  }
  return {
    type: "template",
    name: template.name,
    positional: template.positional.map(cleanInline),
    named: Object.fromEntries(Object.entries(template.named).map(([key, value]) => [key, cleanInline(value)])),
  };
}

function consumeTemplateLine(source, lineStart) {
  const prefixMatch = source.slice(lineStart).match(/^\s*(?::\s*)?/);
  const templateStart = lineStart + (prefixMatch?.[0].length ?? 0);
  if (!source.startsWith("{{", templateStart)) return null;
  const balanced = scanBalanced(source, templateStart, "{{", "}}");
  if (!balanced) return null;
  const restOfLine = source.slice(balanced.end, source.indexOf("\n", balanced.end) === -1 ? source.length : source.indexOf("\n", balanced.end));
  if (restOfLine.trim()) return null;
  return { template: parseTemplate(balanced.raw), end: balanced.end };
}

function appendParagraph(nodes, lines) {
  const text = cleanInline(lines.join("\n"));
  if (text) nodes.push({ type: "text", text });
  lines.length = 0;
}

function groupMessageThreads(nodes) {
  const grouped = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node?.type !== "message-thread-start") {
      grouped.push(node);
      continue;
    }
    const endIndex = nodes.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate?.type === "message-thread-end");
    if (endIndex < 0) {
      grouped.push(node);
      continue;
    }
    const content = nodes.slice(index + 1, endIndex);
    grouped.push({
      type: "message-thread",
      title: node.title ?? "",
      subtitle: node.subtitle ?? "",
      owner: findMessageOwner(content) || "开拓者",
      collapsed: false,
      content,
    });
    index = endIndex;
  }
  return grouped;
}

function tabberNode(content) {
  const parts = [];
  const marker = /^\s*\|-\|\s*(?:(.*?)=\s*)?$/gm;
  const matches = [...content.matchAll(marker)];
  let cursor = 0;
  let pendingTitle = null;
  for (const match of matches) {
    const before = content.slice(cursor, match.index).trim();
    if (before) parts.push({ source: before, title: pendingTitle });
    pendingTitle = match[1]?.trim() || null;
    cursor = match.index + match[0].length;
  }
  const remainder = content.slice(cursor).trim();
  if (remainder) parts.push({ source: remainder, title: pendingTitle });

  const tabs = parts.map((part, index) => {
    const newline = part.source.indexOf("\n");
    const firstLine = newline === -1 ? part.source : part.source.slice(0, newline);
    const inlineTitle = firstLine.match(/^(.*?)=\s*$/);
    const title = part.title ?? inlineTitle?.[1] ?? `分支 ${index + 1}`;
    const body = part.title || !inlineTitle ? part.source : part.source.slice(newline + 1);
    return {
      id: index + 1,
      title: cleanInline(title),
      content: parseBlocks(body),
    };
  });
  return { type: "tabs", tabs };
}

export function parseBlocks(input) {
  const source = normalizeSource(input).trim();
  const nodes = [];
  const paragraph = [];

  for (let position = 0; position < source.length; ) {
    const lineEnd = source.indexOf("\n", position);
    const next = lineEnd === -1 ? source.length : lineEnd + 1;
    const line = source.slice(position, lineEnd === -1 ? source.length : lineEnd);
    const trimmed = line.trim();

    if (/^\s*<center>/iu.test(line)) {
      const centerStart = source.indexOf("<center>", position);
      const centerEnd = source.toLowerCase().indexOf("</center>", centerStart + 8);
      if (centerStart >= 0 && centerEnd >= 0) {
        const inner = source.slice(centerStart + 8, centerEnd).trim();
        const templateStart = inner.indexOf("{{");
        const balanced = templateStart >= 0 ? scanBalanced(inner, templateStart, "{{", "}}") : null;
        if (balanced) {
          const template = parseTemplate(balanced.raw);
          if (template.name === "图片放大") {
            appendParagraph(nodes, paragraph);
            nodes.push(templateNode(template));
            const caption = cleanInline(`${inner.slice(0, templateStart)} ${inner.slice(balanced.end)}`);
            if (caption) nodes.push({ type: "text", text: caption });
            position = centerEnd + "</center>".length;
            if (source[position] === "\n") position += 1;
            continue;
          }
        }
      }
    }

    const fileImage = trimmed.match(/^(?:<center>\s*)?\[\[(?:File|文件):\s*([^|\]]+)((?:\|[^\]]*)*)\]\](?:\s*<\/center>)?$/iu);
    if (fileImage) {
      appendParagraph(nodes, paragraph);
      const options = fileImage[2].split("|").map((value) => value.trim()).filter(Boolean);
      const width = options.find((value) => /^\d+px$/iu.test(value)) ?? "";
      nodes.push({ type: "image", file: cleanInline(fileImage[1]), ...(width ? { displayWidth: width } : {}), ...(options.includes("center") ? { align: "center" } : {}) });
      position = next;
      continue;
    }

    const tabberMatch = trimmed.match(/^<(tabber|tabs)>$/i);
    if (tabberMatch) {
      const closingTag = `</${tabberMatch[1].toLowerCase()}>`;
      const closing = source.toLowerCase().indexOf(closingTag, next);
      if (closing !== -1) {
        appendParagraph(nodes, paragraph);
        nodes.push(tabberNode(source.slice(next, closing)));
        position = closing + closingTag.length;
        if (source[position] === "\n") position += 1;
        continue;
      }
    }

    const centeredTemplate = trimmed.match(/^<center>\s*(\{\{[\s\S]*\}\})\s*<\/center>$/i);
    if (centeredTemplate) {
      const balanced = scanBalanced(centeredTemplate[1], 0, "{{", "}}");
      if (balanced?.end === centeredTemplate[1].length) {
        appendParagraph(nodes, paragraph);
        nodes.push(templateNode(parseTemplate(balanced.raw)));
        position = next;
        continue;
      }
    }

    const centeredImageWithCaption = trimmed.match(/^<center>\s*(\{\{图片放大[\s\S]*?\}\})\s*<br\s*\/?\s*>\s*([\s\S]*?)\s*<\/center>$/iu);
    if (centeredImageWithCaption) {
      const balanced = scanBalanced(centeredImageWithCaption[1], 0, "{{", "}}");
      if (balanced?.end === centeredImageWithCaption[1].length) {
        appendParagraph(nodes, paragraph);
        nodes.push(templateNode(parseTemplate(balanced.raw)));
        const caption = cleanInline(centeredImageWithCaption[2]);
        if (caption) nodes.push({ type: "text", text: caption });
        position = next;
        continue;
      }
    }

    const templateLine = consumeTemplateLine(source, position);
    if (templateLine) {
      appendParagraph(nodes, paragraph);
      nodes.push(templateNode(templateLine.template));
      position = templateLine.end;
      if (source[position] === "\n") position += 1;
      continue;
    }

    const heading = trimmed.match(/^(={2,6})\s*(.*?)\s*\1$/);
    if (heading) {
      appendParagraph(nodes, paragraph);
      nodes.push({ type: "section", level: heading[1].length, title: cleanInline(heading[2]) });
      position = next;
      continue;
    }
    if (/^-{4,}$/.test(trimmed)) {
      appendParagraph(nodes, paragraph);
      nodes.push({ type: "divider" });
      position = next;
      continue;
    }
    const dialogue = trimmed.match(/^\*+\s*([^：:\n]+)[：:]([\s\S]*)$/);
    if (dialogue) {
      appendParagraph(nodes, paragraph);
      nodes.push({ type: "dialogue", speaker: cleanInline(dialogue[1]), text: cleanInline(dialogue[2]) });
      position = next;
      continue;
    }
    const listItem = trimmed.match(/^([*#]+)\s*(.*)$/);
    if (listItem) {
      appendParagraph(nodes, paragraph);
      nodes.push({ type: "list-item", ordered: listItem[1].startsWith("#"), depth: listItem[1].length, text: cleanInline(listItem[2]) });
      position = next;
      continue;
    }
    if (!trimmed) appendParagraph(nodes, paragraph);
    else paragraph.push(line.replace(/^\s*:\s?/, ""));
    position = next;
  }

  appendParagraph(nodes, paragraph);
  return groupMessageThreads(nodes);
}

export function parseStarRailMission(source, sourceMetadata = {}) {
  const normalized = normalizeSource(source);
  const missionTemplate = findTopLevelTemplate(normalized, "任务");
  const plotHeading = /^==\s*剧情内容\s*==\s*$/m;
  const headingMatch = plotHeading.exec(normalized);
  const plotSource = headingMatch ? normalized.slice(headingMatch.index + headingMatch[0].length) : "";

  return {
    schemaVersion: 1,
    game: "崩坏：星穹铁道",
    source: sourceMetadata,
    mission: missionTemplate ? parseMissionMetadata(missionTemplate) : null,
    content: parseBlocks(plotSource),
    warnings: [
      ...(!missionTemplate ? ["未找到 {{任务}} 模板"] : []),
      ...(!headingMatch ? ["未找到 ==剧情内容== 章节"] : []),
    ],
  };
}

export function countNodeTypes(nodes, counts = {}) {
  for (const node of nodes) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    if (node.content) countNodeTypes(node.content, counts);
    if (node.options) {
      for (const option of node.options) countNodeTypes(option.content, counts);
    }
    if (node.tabs) {
      for (const tab of node.tabs) countNodeTypes(tab.content, counts);
    }
  }
  return counts;
}

export function collectTemplateNames(source, counts = {}) {
  for (let index = 0; index < source.length; ) {
    const opening = source.indexOf("{{", index);
    if (opening === -1) break;
    const balanced = scanBalanced(source, opening, "{{", "}}");
    if (!balanced) break;
    const template = parseTemplate(balanced.raw);
    counts[template.name] = (counts[template.name] ?? 0) + 1;
    for (const value of [...template.positional, ...Object.values(template.named)]) {
      collectTemplateNames(value, counts);
    }
    index = balanced.end;
  }
  return counts;
}
