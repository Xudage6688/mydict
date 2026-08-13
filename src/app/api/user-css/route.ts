import { NextRequest } from "next/server";
import { getManager } from "@/lib/dicts";
import { readUserCss, writeUserCss, deleteUserCss } from "@/lib/user-css";

export const dynamic = "force-dynamic";

// 每词典自定义 CSS:?dict=<词典 id>
//   GET    返回 { css: string }(无自定义时为空串)
//   PUT    body = CSS 文本(UTF-8),保存并返回 { css }
//   DELETE 清除该词典的自定义 CSS
async function dictPath(req: NextRequest): Promise<string | null> {
  const id = Number(req.nextUrl.searchParams.get("dict") ?? -1);
  const mgr = getManager();
  const e = mgr.entry(id);
  return e ? e.path : null;
}

export async function GET(req: NextRequest) {
  const p = await dictPath(req);
  if (!p) return new Response("dict unavailable", { status: 404 });
  return Response.json({ css: readUserCss(p) });
}

export async function PUT(req: NextRequest) {
  const p = await dictPath(req);
  if (!p) return new Response("dict unavailable", { status: 404 });
  const css = await req.text();
  writeUserCss(p, css);
  return Response.json({ css: readUserCss(p) });
}

export async function DELETE(req: NextRequest) {
  const p = await dictPath(req);
  if (!p) return new Response("dict unavailable", { status: 404 });
  deleteUserCss(p);
  return Response.json({ css: "" });
}
