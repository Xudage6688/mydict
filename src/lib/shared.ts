// 共享类型、显示名与常量 —— 纯类型/纯函数,不依赖任何 Node 模块,
// 服务端(route/lib)与客户端(components)共用,避免各处重复定义。

// 词条 HTML 轻量消毒(移除 script 与事件属性)。从 html.ts 复用避免重复,
// 该函数本身无 Node 依赖,仅字符串处理。
import { sanitizeHtml } from "./html";

// ---- 类型 ----

export interface DictInfo {
  version: number;
  encoding: string;
  encrypted: number;
  case_sensitive: boolean;
  compact: boolean;
  is_mdd: boolean;
  format: string;
  title: string;
  description: string;
  entries: number;
}

export interface DictEntry {
  id: number;
  path: string;
  name: string; // 文件名(列表快速展示)
  info: DictInfo | null; // 已加载才有;null = 未加载或失败
  error: string | null; // open/加载失败的原因
}

export interface LookupItem {
  dictId: number;
  title: string;
  titleHtml: string; // 安全 HTML 版标题(供 dangerouslySetInnerHTML;title 可能含词典自带富文本标签)
  found: boolean;
  html?: string;
  mddId?: number;
}

// ---- 正则与魔法常量 ----

export const DICT_EXT_RE = /\.(mdx|mdd)$/i;
export const MDX_EXT_RE = /\.mdx$/i;
export const MDD_EXT_RE = /\.mdd$/i;
/** MDXBuilder 未填标题时的占位文本。 */
export const PLACEHOLDER_TITLE_RE = /no html code allowed/i;

/** 查询历史在 localStorage 中的最大条数。 */
export const HISTORY_MAX = 50;
/** 输入联想默认返回条数上限。 */
export const SUGGEST_LIMIT = 10;
/** 未命中时拼写近似的候选条数。 */
export const SUGGEST_LIMIT_MISS = 30;
/** 联想输入防抖毫秒数。 */
export const SUGGEST_DEBOUNCE_MS = 200;
/** 拼写近似允许的最大编辑距离。 */
export const LEVENSHTEIN_MAX = 3;

// ---- 显示名 ----

/** 词典显示名:title 有效则用 title;占位/空标题回退文件名(去扩展名)。 */
export function dictDisplayName(title: string, name: string): string {
  const t = title.trim();
  if (t && !PLACEHOLDER_TITLE_RE.test(t)) return t;
  return name.replace(DICT_EXT_RE, "");
}

/** HTML 转义(纯文本 -> 安全 HTML 文本)。 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 词典标题的安全 HTML(供 dangerouslySetInnerHTML 渲染):
 * - title 有效(可能是词典自带的富文本,含 <span>/<font> 等样式标签)→ 消毒后原样
 * - 占位/空标题回退文件名 → 按纯文本转义(文件名不是 HTML)
 */
export function titleHtml(title: string, name: string): string {
  const t = title.trim();
  if (t && !PLACEHOLDER_TITLE_RE.test(t)) return sanitizeHtml(t);
  return escapeHtml(name.replace(DICT_EXT_RE, ""));
}
