// 词条处理结果缓存(进程级):dictId:word → { html, mddId }。
// 词条内容与资源改写结果静态,二次查询命中时跳过引擎查询与消毒/改写。
// 模块级 Map,dev 热重载会重置(可接受);按字节上限(50MB)淘汰最旧。

type EntryCacheValue = { html: string; mddId: number; bytes: number };
const entryCache = new Map<string, EntryCacheValue>();
const ENTRY_CACHE_MAX_BYTES = 50 * 1024 * 1024;
let entryCacheBytes = 0;

/** 读取词条缓存(命中视为最近使用,移到末尾;Map 插入序近似 LRU)。 */
export function getEntryCache(dictId: number, word: string): string | null {
  const key = `${dictId}:${word}`;
  const hit = entryCache.get(key);
  if (hit) {
    entryCache.delete(key);
    entryCache.set(key, hit);
  }
  return hit?.html ?? null;
}

/** 写入词条缓存;超上限(50MB)时按最旧淘汰。 */
export function setEntryCache(dictId: number, word: string, html: string, mddId: number): void {
  const key = `${dictId}:${word}`;
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > ENTRY_CACHE_MAX_BYTES) return; // 单条超大不缓存
  const prev = entryCache.get(key);
  if (prev) entryCacheBytes -= prev.bytes;
  entryCache.set(key, { html, mddId, bytes });
  entryCacheBytes += bytes;
  while (entryCacheBytes > ENTRY_CACHE_MAX_BYTES && entryCache.size > 1) {
    const [k, v] = entryCache.entries().next().value as [string, EntryCacheValue];
    entryCache.delete(k);
    entryCacheBytes -= v.bytes;
  }
}

/** 清空词条缓存(供 GC 端点释放缓存内存)。 */
export function clearEntryCache(): void {
  entryCache.clear();
  entryCacheBytes = 0;
}

