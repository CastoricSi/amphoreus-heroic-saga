const API_URL = "https://wiki.biligame.com/sr/api.php";
const USER_AGENT = "castorice-star-rail-mission-fetcher/1.0";

export function titleFromInput(input) {
  if (!/^https?:\/\//i.test(input)) return input.trim();
  const url = new URL(input);
  const queryTitle = url.searchParams.get("title");
  if (queryTitle) return queryTitle.trim();
  const segments = url.pathname.split("/").filter(Boolean);
  const wikiRoot = segments.findIndex((segment) => segment.toLowerCase() === "sr");
  const titleSegments = wikiRoot === -1 ? segments.slice(-1) : segments.slice(wikiRoot + 1);
  return decodeURIComponent(titleSegments.join("/")).trim();
}

export function safeFilename(value) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/, "")
    .replace(/^(con|prn|aux|nul|com\d|lpt\d)$/i, "_$1") || "mission";
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchRevision(input, options = {}) {
  const title = titleFromInput(input);
  const retries = options.retries ?? 5;
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    redirects: "1",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const apiRequestUrl = `${API_URL}?${params}`;

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(apiRequestUrl, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });
    } catch (error) {
      if (attempt >= retries) throw error;
      await wait(2000 * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      if (attempt >= retries || ![429, 500, 502, 503, 504, 567].includes(response.status)) {
        throw new Error(`BWiki API 返回 HTTP ${response.status}`);
      }
      const delay = Math.min(30000, 3000 * (attempt + 1));
      options.onRetry?.({ title, status: response.status, attempt: attempt + 1, delay });
      await wait(delay);
      continue;
    }

    const payload = await response.json();
    if (payload.error) throw new Error(`${payload.error.code}: ${payload.error.info}`);
    const page = payload.query?.pages?.[0];
    if (!page || page.missing) throw new Error(`找不到页面：${title}`);
    const revision = page.revisions?.[0];
    const wikitext = revision?.slots?.main?.content;
    if (typeof wikitext !== "string") throw new Error(`页面没有可读取的源文本：${page.title}`);

    return {
      title: page.title,
      pageId: page.pageid,
      revisionId: revision.revid,
      parentRevisionId: revision.parentid,
      revisionTimestamp: revision.timestamp,
      wikitext,
      apiRequestUrl,
    };
  }
}

export function sourceMetadata(revision) {
  return {
    wiki: "BWiki 崩坏：星穹铁道",
    title: revision.title,
    pageId: revision.pageId,
    revisionId: revision.revisionId,
    parentRevisionId: revision.parentRevisionId,
    revisionTimestamp: revision.revisionTimestamp,
    fetchedAt: new Date().toISOString(),
    pageUrl: `https://wiki.biligame.com/sr/${encodeURIComponent(revision.title)}`,
    editUrl: `https://wiki.biligame.com/sr/index.php?title=${encodeURIComponent(revision.title)}&action=edit`,
    apiUrl: API_URL,
  };
}
