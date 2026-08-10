import { NextRequest } from "next/server";
import { MDX_EXT_RE, SUGGEST_LIMIT } from "@/lib/shared";
import { getManager } from "@/lib/dicts";
import { MdictDict } from "@/lib/mdict";

export const dynamic = "force-dynamic";

// 输入联想:?prefix=<前缀>[&dict=<id>][&limit=<n>]
// 不带 dict 时默认用第一个可用 MDX 词典(拼写近似建议同此)。
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const prefix = sp.get("prefix") ?? "";
  const limit = Math.min(Number(sp.get("limit") ?? SUGGEST_LIMIT) || SUGGEST_LIMIT, 50);

  const mgr = getManager();
  let d: MdictDict | null = null;
  const dict = sp.get("dict");
  if (dict !== null) {
    d = mgr.get(Number(dict));
  } else {
    const first = mgr.list().find((e) => MDX_EXT_RE.test(e.path));
    if (first) d = mgr.get(first.id);
  }
  if (!d) return Response.json({ suggestions: [] });

  return Response.json({ suggestions: d.suggest(prefix, limit) });
}
