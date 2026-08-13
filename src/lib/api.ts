// 前端 API 封装:所有服务端接口的 fetch 与 URL 构造集中于此。
import { DictEntry, DictInfo, LookupItem, SUGGEST_LIMIT } from "./shared";

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json() as Promise<T>;
}

export function fetchDicts(signal?: AbortSignal): Promise<{ dicts: DictEntry[] }> {
  return getJSON("/api/dicts", signal);
}

export function fetchLookup(
  word: string,
  signal?: AbortSignal,
): Promise<{ query: string; results: LookupItem[] }> {
  return getJSON(`/api/lookup?word=${encodeURIComponent(word)}`, signal);
}

export function fetchSuggest(
  dict: number,
  prefix: string,
  limit = SUGGEST_LIMIT,
  signal?: AbortSignal,
): Promise<{ suggestions: string[] }> {
  // dict >= 0 限定单本词典;dict < 0 不限定,服务端聚合全部 MDX 词典
  const dictParam = dict >= 0 ? `&dict=${dict}` : "";
  return getJSON(
    `/api/suggest?prefix=${encodeURIComponent(prefix)}&limit=${limit}${dictParam}`,
    signal,
  );
}

export interface DictInfoDetail {
  id: number;
  name: string;
  path: string;
  info: DictInfo | null;
  title: string;
  titleHtml: string; // 安全 HTML 版标题(供 dangerouslySetInnerHTML)
  cover: string | null;
}

export function fetchDictInfo(
  id: number,
  signal?: AbortSignal,
): Promise<DictInfoDetail> {
  return getJSON(`/api/dict-info?id=${id}`, signal);
}

// ---- 每词典自定义 CSS ----

export function fetchUserCss(id: number): Promise<{ css: string }> {
  return getJSON(`/api/user-css?dict=${id}`);
}

export async function saveUserCss(id: number, css: string): Promise<void> {
  const r = await fetch(`/api/user-css?dict=${id}`, {
    method: "PUT",
    body: css,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: save user css`);
}

export async function clearUserCss(id: number): Promise<void> {
  const r = await fetch(`/api/user-css?dict=${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`HTTP ${r.status}: clear user css`);
}

/** 构造资源 URL(路径型,见 html.ts rewriteResources 的说明)。 */
export function resourceUrl(mddId: number, resourcePath: string): string {
  return `/api/resource/${mddId}/${encodeURIComponent(resourcePath)}`;
}
