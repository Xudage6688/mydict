import { NextRequest } from "next/server";
import { dictDisplayName, titleHtml, MDX_EXT_RE, LookupItem } from "@/lib/shared";
import { getManager } from "@/lib/dicts";
import { rewriteResources, sanitizeHtml } from "@/lib/html";

export const dynamic = "force-dynamic";

// 词条处理结果缓存(进程级):dictId:word → { html, mddId }。
// 词条内容与资源改写结果静态,二次查询命中时跳过引擎查询与消毒/改写。
// 模块级 Map,dev 热重载会重置(可接受);按字节上限(50MB)淘汰最旧。
type EntryCacheValue = { html: string; mddId: number; bytes: number };
const entryCache = new Map<string, EntryCacheValue>();
const ENTRY_CACHE_MAX_BYTES = 50 * 1024 * 1024;
let entryCacheBytes = 0;

// 查词:?word=<词>[&dict=<id>]
// 不带 dict 时一次查询全部 MDX 词典,结果按词典分组;带 dict 仅查指定词典。
// 词条 HTML 先消毒,再把资源引用改写为 /api/resource(指向同名 MDD)。
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const word = sp.get("word") ?? "";
  if (!word) return Response.json({ query: word, results: [], error: "missing word" });

  const mgr = getManager();
  const dictParam = sp.get("dict");
  const ids: number[] = dictParam !== null
    ? [Number(dictParam)]
    : mgr.list().filter((e) => MDX_EXT_RE.test(e.path)).map((e) => e.id);

  const results: LookupItem[] = [];
  for (const id of ids) {
    const d = mgr.get(id);
    if (!d || d.info().is_mdd) continue; // open 失败或资源库,跳过
    const entry = mgr.entry(id);
    const title = dictDisplayName(d.info().title ?? "", entry?.name ?? "");
    const htmlTitle = titleHtml(d.info().title ?? "", entry?.name ?? "");
    const cacheKey = `${id}:${word}`;
    const cached = entryCache.get(cacheKey);
    if (cached) {
      results.push({ dictId: id, title, titleHtml: htmlTitle, found: true, html: cached.html, mddId: cached.mddId });
      continue;
    }
    const raw = d.lookup(word);
    if (raw === null) continue;
    const mddId = mgr.mddFor(id);
    // 资源入口:同名 MDD 优先;无 MDD 时用词典自身(资源路由会回退磁盘文件)
    const resourceId = mddId >= 0 ? mddId : id;
    const html = rewriteResources(sanitizeHtml(raw), resourceId);
    const bytes = Buffer.byteLength(html, "utf8");
    if (bytes <= ENTRY_CACHE_MAX_BYTES) {
      const prev = entryCache.get(cacheKey);
      if (prev) entryCacheBytes -= prev.bytes;
      entryCache.set(cacheKey, { html, mddId, bytes });
      entryCacheBytes += bytes;
      while (entryCacheBytes > ENTRY_CACHE_MAX_BYTES && entryCache.size > 1) {
        const [k, v] = entryCache.entries().next().value as [
          string,
          EntryCacheValue,
        ];
        entryCache.delete(k);
        entryCacheBytes -= v.bytes;
      }
    }
    results.push({ dictId: id, title, titleHtml: htmlTitle, found: true, html, mddId });
  }
  return Response.json({ query: word, results });
}
