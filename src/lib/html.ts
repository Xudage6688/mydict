// 词条 HTML 的轻量处理:基础消毒 + 资源引用改写。
//
// 不做完整 DOM 消毒(本地可信词典),只移除 script 与事件属性;
// 资源引用(sound://、相对路径图片/样式)改写为路径型 /api/resource 以走 MDD。

/** 移除 <script>、on* 事件属性、javascript: 链接。 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(src|href)\s*=\s*["']javascript:[^"']*["']/gi, "");
}

/**
 * 把词条内的资源引用改写为 /api/resource/<mddId>/<path>(路径型 URL)。
 * 不改写:绝对 URL(http/https)、data:、entry:// 互链、已有 /api/resource 链接。
 * 改写:sound://、file:// 前缀引用与相对路径(src/href 指向 MDD 里的资源)。
 * 属性值带引号与不带引号(如 src=file://x_apple.jpg)均处理。
 *
 * 用路径型(而非 ?dict=&path=)的关键原因:CSS 内部的相对 url() 以 CSS
 * 文件自身的 URL 为基准解析;路径型让该基准落在 /api/resource/<mddId>/ 下,
 * CSS 内嵌引用自动解析到正确的资源 URL,无需改写 CSS 内容。
 */
export function rewriteResources(html: string, mddId: number): string {
  if (mddId < 0) return html;
  const q = (s: string) =>
    `/api/resource/${mddId}/${encodeURIComponent(s)}`;
  const rewriteValue = (val: string): string | null => {
    if (/^(https?:|data:|entry:|\/api\/resource)/i.test(val)) return null;
    if (/^file:\/\//i.test(val)) return q(val.replace(/^file:\/\//i, ""));
    if (/^sound:\/\//i.test(val)) return q(val.replace(/^sound:\/\//i, ""));
    return q(val);
  };
  return html.replace(
    /\b(src|href)=("[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi,
    (m, attr: string, raw: string) => {
      const val =
        raw.length >= 2 && (raw[0] === '"' || raw[0] === "'")
          ? raw.slice(1, -1)
          : raw;
      const nv = rewriteValue(val);
      return nv === null ? m : `${attr}="${nv}"`;
    },
  );
}
