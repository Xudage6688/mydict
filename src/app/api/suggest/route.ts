import { NextRequest } from "next/server";
import { MDX_EXT_RE, SUGGEST_LIMIT } from "@/lib/shared";
import { getManager } from "@/lib/dicts";
import { MdictDict } from "@/lib/mdict";

export const dynamic = "force-dynamic";

// 输入联想:?prefix=<前缀>[&dict=<id>][&limit=<n>]
// 带 dict 只查指定词典;不带 dict(或 dict=-1)时聚合全部 MDX 词典,
// 去重后按字母序返回 limit 条——避免"词条只在某本词典中,首本词典
// 无匹配导致联想为空"的假性未命中(拼写近似建议同走此路径)。
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const prefix = sp.get("prefix") ?? "";
  const limit = Math.min(Number(sp.get("limit") ?? SUGGEST_LIMIT) || SUGGEST_LIMIT, 50);

  const mgr = getManager();
  const dict = sp.get("dict");
  if (dict !== null) {
    const d = dict === "-1" ? null : mgr.get(Number(dict));
    if (d) return Response.json({ suggestions: d.suggest(prefix, limit) });
    // dict=-1 或无效 id:回落聚合
  }

  // 聚合全部 MDX 词典:前缀匹配(每本引擎内已按字典序返回)合并去重后整体排序
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of mgr.list()) {
    if (!MDX_EXT_RE.test(e.path)) continue;
    const d: MdictDict | null = mgr.get(e.id);
    if (!d) continue;
    for (const s of d.suggest(prefix, limit)) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  out.sort();
  return Response.json({ suggestions: out.slice(0, limit) });
}
