import { NextRequest } from "next/server";
import { getManager } from "@/lib/dicts";
import { clearResourceCaches } from "@/lib/resource";
import { clearEntryCache } from "@/lib/entry-cache";

export const dynamic = "force-dynamic";

// 内存回收管理员端点:定时(cron)POST 触发。
// 关闭全部词典句柄(释放引擎 mmap)+ 清空词条/资源缓存(否则为活引用,
// V8 GC 无法回收)+ 触发 V8 GC(需 --expose-gc 启动)。
// 句柄与缓存以查询时惰性重建,该操作自愈;但会导致全量惰性重载,故需鉴权:
// 默认禁用;设置 MDICT_GC_TOKEN 后,请求须带头部 x-gc-token 与之匹配。
export async function POST(req: NextRequest) {
  const token = process.env.MDICT_GC_TOKEN;
  if (!token || req.headers.get("x-gc-token") !== token) {
    return new Response("unauthorized", { status: 403 });
  }
  const mgr = getManager();
  mgr.evictAll();
  clearEntryCache();
  clearResourceCaches();
  (globalThis as unknown as { gc?: () => void }).gc?.();
  return Response.json({ ok: true });
}