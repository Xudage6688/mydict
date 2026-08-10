import { NextRequest } from "next/server";
import path from "node:path";
import { getManager } from "@/lib/dicts";
import { mimeOf, resolveDiskResource, resolveResource } from "@/lib/resource";

export const dynamic = "force-dynamic";

// 路径型资源路由(主):/api/resource/<dictId>/<path...>
// 先查同名 MDD,查不到时回退到词典文件所在目录的磁盘文件(部分词典
// 的资源直接外置,如 简明必应版-css/concise-bing.css)。
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ dict: string; path: string[] }> },
) {
  void req;
  const { dict, path: segments } = await ctx.params;
  const id = Number(dict);
  const d = getManager().get(id);
  if (!d) return new Response("dict unavailable", { status: 404 });

  const p = segments.map(decodeURIComponent).join("/");
  let buf = resolveResource(id, d, p);
  if (!buf) {
    const entry = getManager().entry(id);
    if (entry) buf = resolveDiskResource(path.dirname(entry.path), p);
  }
  if (!buf) return new Response("resource not found", { status: 404 });

  return new Response(Buffer.from(buf), {
    headers: {
      "Content-Type": mimeOf(p),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
