import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// 兼容旧形态的 query 资源路由:/api/resource?dict=<id>&path=<资源名>
// 新链接为路径型 /api/resource/<id>/<path>(见 [dict]/[...path]/route.ts,
// CSS 内嵌相对 url() 需要以资源自身 URL 为基准解析)。
// 此处仅做 301 转发,资源读取逻辑只保留在路径型路由一份。
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dict = sp.get("dict") ?? "";
  const p = sp.get("path") ?? "";
  if (!p) return new Response("missing path", { status: 400 });

  const url = new URL(`/api/resource/${dict}/${encodeURIComponent(p)}`, req.url);
  return Response.redirect(url, 301);
}
