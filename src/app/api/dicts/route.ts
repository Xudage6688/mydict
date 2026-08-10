import { NextRequest } from "next/server";
import { getManager } from "@/lib/dicts";

export const dynamic = "force-dynamic";

// 词典列表(不 open,秒回;info 仅在已加载时出现)。
export async function GET(req: NextRequest) {
  void req;
  return Response.json({ dicts: getManager().list() });
}
