// 词典管理器:扫描词典目录、启动即全量加载、句柄 LRU 淘汰。
//
// 设计:服务进程启动时(instrumentation 触发 getManager)立即扫描词典目录,
// 并在后台分批 open 全部词典(.mdx/.mdd),让后续查询直接命中句柄缓存、秒回。
// open 为同步 C 调用,分批(间隔 10ms)温和执行,不阻塞启动与列表请求;
// 某本失败静默记入 entry.error,不影响其他词典。
// 句柄按 LRU 淘汰(超上限即 close 引擎、释放 mmap),不再进程内常驻,后续查询惰性重开。
import fs from "node:fs";
import path from "node:path";
import {
  DICT_EXT_RE,
  DictEntry,
  MDX_EXT_RE,
  MDD_EXT_RE,
} from "./shared";
import { getLib, MdictDict } from "./mdict";

// 词典目录:MDICT_DIR 环境变量指定;未设置时默认项目根目录的 dicts/。
export const DEFAULT_DIR: string =
  process.env.MDICT_DIR ?? path.join(process.cwd(), "dicts");

// 词典过滤:MDICT_FILTER 为逗号分隔的关键词(不区分大小写,子串匹配文件名)。
// 设置后仅收录匹配的词典 —— 用于在共享/多词典目录里只启用需要的几本。
const FILTER_TERMS: string[] = (process.env.MDICT_FILTER ?? "")
  .split(",")
  .map((t) => t.trim().toLowerCase())
  .filter(Boolean);

// 启动预热仅 open 不超过该大小的词典;更大的(通常是大 MDX/MDD)查询时才惰性打开,
// 避免启动即把全部引擎索引/词条 mmap 进内存。
const WARMUP_MAX_BYTES = 20 * 1024 * 1024;

// 递归扫描:只收 .mdx/.mdd,跳过 macOS 拷贝残留的 ._ 元数据文件。
function scanDir(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("._")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...scanDir(full));
    else if (DICT_EXT_RE.test(entry.name)) {
      if (
        FILTER_TERMS.length > 0 &&
        !FILTER_TERMS.some((t) => entry.name.toLowerCase().includes(t))
      )
        continue;
      out.push(full);
    }
  }
  return out.sort();
}

class DictManager {
  private readonly lib = getLib();
  private entries: DictEntry[] = [];
  private entryById = new Map<number, DictEntry>();
  private handles: Map<number, MdictDict> = new Map();
  private handleOrder: number[] = []; // 句柄使用序(尾=最近使用),超上限时从头淘汰并 close
  private readonly HANDLES_MAX = 24; // 句柄上限:仅当启用词典数超过该值(现为 13)时淘汰才被触发
  private mddForCache = new Map<number, number>();
  private scanned = false;
  private warmupStarted = false;

  /** 扫描目录并返回词典列表(不 open);首次请求时兜底触发全量加载。 */
  list(): DictEntry[] {
    this.startWarmup(); // 幂等:instrumentation 未触发时,首次请求兜底
    return this.scan();
  }

  /** 扫描一次目录并填充条目(幂等,纯文件系统遍历)。 */
  private scan(): DictEntry[] {
    if (this.scanned) return this.entries;
    this.scanned = true;
    if (!fs.existsSync(DEFAULT_DIR)) {
      this.entries = [];
      return this.entries;
    }
    this.entries = scanDir(DEFAULT_DIR).map((p, i) => {
      const e: DictEntry = {
        id: i,
        path: p,
        name: path.basename(p),
        info: null,
        error: null,
      };
      return e;
    });
    for (const e of this.entries) this.entryById.set(e.id, e);
    return this.entries;
  }

  /** 按 id 取词典条目(索引,无则 undefined)。 */
  entry(id: number): DictEntry | undefined {
    return this.entryById.get(id);
  }

  /** 取词典句柄(惰性 open 并缓存;命中即视为最近使用;失败记 error 且返回 null)。 */
  get(id: number): MdictDict | null {
    const hit = this.handles.get(id);
    if (hit) {
      this.touch(id);
      return hit;
    }
    const entry = this.entryById.get(id);
    if (!entry) return null;
    if (entry.error) return null; // 已失败,不重试
    try {
      const d = MdictDict.open(this.lib, entry.path);
      this.handles.set(id, d);
      this.touch(id);
      this.evictIfOver();
      entry.info = d.info();
      return d;
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  /** 把 id 记为最近使用(移到使用序尾部)。 */
  private touch(id: number): void {
    const i = this.handleOrder.indexOf(id);
    if (i >= 0) this.handleOrder.splice(i, 1);
    this.handleOrder.push(id);
  }

  /** 句柄超上限时淘汰最久未用的并 close,释放引擎 mmap。 */
  private evictIfOver(): void {
    while (this.handleOrder.length > this.HANDLES_MAX) {
      const old = this.handleOrder.shift() as number;
      const h = this.handles.get(old);
      this.handles.delete(old);
      h?.close();
    }
  }

  /** 关闭全部句柄并清空缓存(供 GC 端点触发;句柄按需惰性重开)。 */
  evictAll(): void {
    for (const id of this.handleOrder) {
      this.handles.get(id)?.close();
    }
    this.handles.clear();
    this.handleOrder = [];
  }

  /** 同名(去扩展名)的 MDD 条目 id,供词条资源定位;无则 -1(带缓存)。 */
  mddFor(mdxId: number): number {
    const cached = this.mddForCache.get(mdxId);
    if (cached !== undefined) return cached;
    const mdx = this.entryById.get(mdxId);
    let result = -1;
    if (mdx && MDX_EXT_RE.test(mdx.path)) {
      const base = mdx.path.replace(MDX_EXT_RE, "");
      const mdd = this.entries.find((e) => e.path.replace(MDD_EXT_RE, "") === base);
      if (mdd) result = mdd.id;
    }
    this.mddForCache.set(mdxId, result);
    return result;
  }

  /**
   * 启动全量后台加载:分批(间隔 10ms)open 小词典(≤20MB,含 MDD),
   * 大词典跳过、查询时惰性打开 —— 避免启动即吞掉全部内存。
   * open 为同步 C 调用,失败静默(记入 entry.error,后续查询不再尝试)。幂等。
   */
  startWarmup(): void {
    if (this.warmupStarted) return;
    const entries = this.scan();
    if (entries.length === 0) return;
    this.warmupStarted = true;
    const queue = entries.filter((e) => {
      try {
        return fs.statSync(e.path).size <= WARMUP_MAX_BYTES;
      } catch {
        return false;
      }
    });
    if (queue.length === 0) return;
    const step = () => {
      const e = queue.shift();
      if (!e) return;
      this.get(e.id);
      setTimeout(step, 10);
    };
    // 先让进程启动/首个列表请求返回,再开始加载
    setTimeout(step, 50);
  }
}

// Next.js dev 热重载会重新执行模块,用 globalThis 保存进程级单例。
const g = globalThis as unknown as { __mdictManager?: DictManager };
export function getManager(): DictManager {
  if (!g.__mdictManager) {
    g.__mdictManager = new DictManager();
    g.__mdictManager.startWarmup(); // 构造即全量加载
  }
  return g.__mdictManager;
}
