import { NextRequest } from "next/server";
import { dictDisplayName, titleHtml, MDX_EXT_RE, LookupItem } from "@/lib/shared";
import { getManager } from "@/lib/dicts";
import { rewriteResources, sanitizeHtml } from "@/lib/html";
import { getEntryCache, setEntryCache } from "@/lib/entry-cache";

export const dynamic = "force-dynamic";

// 查词:?word=<词>[&dict=<id>]
// 不带 dict 时一次查询全部 MDX 词典,结果按词典分组;带 dict 仅查指定词典。
// 词条 HTML 先消毒,再把资源引用改写为 /api/resource(指向同名 MDD)。
// 词条缓存(进程级,50MB 字节上限)见 lib/entry-cache.ts。
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

  // 同步 C 调用(koffi)逐本执行;每本之间 setImmediate 让出事件循环,
  // 避免大词典 open/查询期间阻塞其他请求(查词/联想/资源)。
  // (executor 形式:兼容 Node 18,Promise.withResolvers 需 ≥22)
  for (const id of ids) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const d = mgr.get(id);
    if (!d || d.info().is_mdd) continue; // open 失败或资源库,跳过
    const entry = mgr.entry(id);
    const title = dictDisplayName(d.info().title ?? "", entry?.name ?? "");
    const htmlTitle = titleHtml(d.info().title ?? "", entry?.name ?? "");
    const cached = getEntryCache(id, word);
    if (cached !== null) {
      results.push({ dictId: id, title, titleHtml: htmlTitle, found: true, html: cached, mddId: mgr.mddFor(id) });
      continue;
    }
    const raw = d.lookup(word);
    if (raw === null) continue;
    const mddId = mgr.mddFor(id);
    // 资源入口:同名 MDD 优先;无 MDD 时用词典自身(资源路由会回退磁盘文件)
    const resourceId = mddId >= 0 ? mddId : id;
    const html = rewriteResources(sanitizeHtml(raw), resourceId);
    setEntryCache(id, word, html, mddId);
    results.push({ dictId: id, title, titleHtml: htmlTitle, found: true, html, mddId });
  }
  return Response.json({ query: word, results });
}
