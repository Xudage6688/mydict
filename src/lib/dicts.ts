// 词典管理器:扫描词典目录、按需 open(惰性,首次查询才加载)、进程内常驻。
//
// 设计:扫描(纯文件系统,秒回)与 open(读索引,大词典可达秒级)分离,
// 词典列表请求不阻塞;查询某本词典时才 open 并缓存结果。
import fs from "node:fs";
import path from "node:path";
import {
  DICT_EXT_RE,
  DictEntry,
  dictDisplayName,
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

/** 后台预热跳过超过该大小的词典文件(内存与预热时间权衡)。 */
const WARMUP_MAX_BYTES = 80 * 1024 * 1024;

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
  private mddForCache = new Map<number, number>();
  private scanned = false;
  private warmupStarted = false;

  /** 扫描目录并返回词典列表(不 open);首次扫描后触发后台温和预热。 */
  list(): DictEntry[] {
    if (!this.scanned) {
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
      this.scheduleWarmup();
    }
    return this.entries;
  }

  /** 按 id 取词典条目(索引,无则 undefined)。 */
  entry(id: number): DictEntry | undefined {
    return this.entryById.get(id);
  }

  /** 取词典句柄(惰性 open 并缓存;失败记 error 且返回 null)。 */
  get(id: number): MdictDict | null {
    const hit = this.handles.get(id);
    if (hit) return hit;
    const entry = this.entryById.get(id);
    if (!entry) return null;
    if (entry.error) return null; // 已失败,不重试
    try {
      const d = MdictDict.open(this.lib, entry.path);
      this.handles.set(id, d);
      entry.info = d.info();
      return d;
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
      return null;
    }
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
   * 后台温和预热:list() 首次扫描后,分批(间隔 10ms)open 中小 MDX,
   * 让首次查询大部分词典直接命中句柄缓存。跳过:已失败、MDD、超过
   * 80MB 的大文件(内存与预热时间权衡,超大词典仍惰性首查)。
   * open 为同步 C 调用,失败静默(记入 entry.error,后续查询不再尝试)。
   */
  private scheduleWarmup(): void {
    if (this.warmupStarted || this.entries.length === 0) return;
    this.warmupStarted = true;
    const queue = this.entries.filter((e) => {
      if (e.error || MDD_EXT_RE.test(e.path)) return false;
      try {
        return fs.statSync(e.path).size <= WARMUP_MAX_BYTES;
      } catch {
        return false;
      }
    });
    const step = () => {
      const e = queue.shift();
      if (!e) return;
      this.get(e.id);
      setTimeout(step, 10);
    };
    // 先让首个列表请求返回,再开始预热
    setTimeout(step, 50);
  }
}

// Next.js dev 热重载会重新执行模块,用 globalThis 保存进程级单例。
const g = globalThis as unknown as { __mdictManager?: DictManager };
export function getManager(): DictManager {
  if (!g.__mdictManager) g.__mdictManager = new DictManager();
  return g.__mdictManager;
}
