import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { dictDisplayName, MDX_EXT_RE } from "@/lib/shared";
import { getManager } from "@/lib/dicts";

export const dynamic = "force-dynamic";

// 在词典文件同目录找同名封面(一般是 png,兼容常见图片格式)。
function findCover(mdxPath: string): string | null {
  const dir = path.dirname(mdxPath);
  const base = path.basename(mdxPath).replace(MDX_EXT_RE, "");
  for (const ext of ["png", "jpg", "jpeg", "bmp", "gif"]) {
    const f = base + "." + ext;
    if (fs.existsSync(path.join(dir, f))) return f;
  }
  return null;
}

// 词典详情:?id=<词典 id>
// 返回 header(XML)解析出的信息(info)、封面文件名(同名同级图片,可经
// /api/resource/<id>/<cover> 加载)与文件路径。
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id") ?? -1);
  const mgr = getManager();
  const d = mgr.get(id);
  const entry = mgr.list().find((e) => e.id === id);
  if (!d || !entry) return new Response("dict unavailable", { status: 404 });

  return Response.json({
    id,
    name: entry.name,
    path: entry.path,
    info: d.info(),
    title: dictDisplayName(d.info().title ?? "", entry.name),
    cover: findCover(entry.path),
  });
}
