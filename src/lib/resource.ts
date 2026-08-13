// 资源读取与进程级缓存:
//   1. MDD key 写法随生成器而异,按候选序列尝试;命中缓存(容量上限,LRU 语义)
//   2. 部分词典(或同名 MDD)没有收录全部资源,资源文件直接放在词典
//      同级目录(如 简明必应版-css/concise-bing.css),查不到 mdd 时回退磁盘
//      (按 mtime 失效的磁盘缓存,避免每次 statSync + readFileSync)
//   3. 词条里的资源引用可能带词典制作者的控制字符标记(如 \x1E...\x1F
//      包裹资源名),候选解析时剥离 0x00-0x1F
import fs from "node:fs";
import path from "node:path";
import { MdictDict } from "@/lib/mdict";

/** 剥离控制字符(资源名不可能含 0x00-0x1F,但词条引用可能带制作者标记)。 */
export function stripControl(p: string): string {
  return p.replace(/[\x00-\x1f]/g, "");
}

/** 由 HTML/CSS 中出现的资源引用生成 MDD key 候选(原样 + 剥离控制字符)。 */
export function resourceCandidates(p: string): string[] {
  const out = new Set<string>();
  for (const base of [p, stripControl(p)]) {
    out.add(base);
    const norm = base.replace(/\//g, "\\"); // CSS 用 /,MDD key 常用 \
    out.add(norm);
    if (!norm.startsWith("\\")) out.add("\\" + norm);
    if (norm.startsWith("\\")) out.add(norm.slice(1));
  }
  return [...out];
}

// ---- MIME(集中管理,供 resource 路由使用) ----

const MIME: Record<string, string> = {
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  spx: "audio/ogg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  html: "text/html",
  htm: "text/html",
  txt: "text/plain",
  xml: "text/xml",
};

export function mimeOf(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

// ---- MDD 资源缓存 ----
// key: `${dictId}:${候选}`,值即引擎返回的字节。Map 保持插入序,
// 超容量时删除最旧(近似 LRU)。音频/大图命中率最高,收益明显。

const MDD_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const mddCache = new Map<string, Uint8Array>();
let mddCacheBytes = 0;

function mddCacheGet(key: string): Uint8Array | undefined {
  const v = mddCache.get(key);
  if (v) {
    // 命中即视为最近使用,移到末尾
    mddCache.delete(key);
    mddCache.set(key, v);
  }
  return v;
}

function mddCacheSet(key: string, v: Uint8Array): void {
  if (v.length > MDD_CACHE_MAX_BYTES) return; // 单条超大不缓存
  const prev = mddCache.get(key);
  if (prev) mddCacheBytes -= prev.length;
  mddCache.set(key, v);
  mddCacheBytes += v.length;
  while (mddCacheBytes > MDD_CACHE_MAX_BYTES && mddCache.size > 1) {
    const [k, val] = mddCache.entries().next().value as [string, Uint8Array];
    mddCache.delete(k);
    mddCacheBytes -= val.length;
  }
}

/** 依次尝试 MDD 候选,返回首个命中的字节(带缓存);全未命中返回 null。 */
export function resolveResource(
  dictId: number,
  d: MdictDict,
  p: string,
): Uint8Array | null {
  for (const c of resourceCandidates(p)) {
    const key = `${dictId}:${c}`;
    const hit = mddCacheGet(key);
    if (hit) return hit;
    const buf = d.lookupBuf(c);
    if (buf) {
      mddCacheSet(key, buf);
      return buf;
    }
  }
  return null;
}

// ---- 磁盘资源回退 + 缓存 ----
// 缓存按文件 mtime 失效:每次请求仍 stat(便宜),仅在 mtime 未变时
// 复用已读字节,避免每次都整文件 readFileSync 阻塞事件循环。

const DISK_CACHE_MAX = 256;
const DISK_CACHE_MAX_BYTES = 32 * 1024 * 1024;
type DiskCacheValue = { mtimeMs: number; buf: Buffer };
const diskCache = new Map<string, DiskCacheValue>();
let diskCacheBytes = 0;

/**
 * 磁盘资源回退:在词典文件所在目录下寻找 path 对应的文件。
 * 拒绝路径穿越(..),路径分隔符 / 与 \ 均接受,并剥离控制字符。
 */
export function resolveDiskResource(dir: string, p: string): Buffer | null {
  const norm = stripControl(p).replace(/\\/g, "/");
  if (norm.split("/").includes("..")) return null; // 穿越防护
  const file = path.join(dir, ...norm.split("/").filter(Boolean));
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    const hit = diskCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.buf;
    const buf = fs.readFileSync(file);
    if (buf.length <= DISK_CACHE_MAX_BYTES) {
      const prev = diskCache.get(file);
      if (prev) diskCacheBytes -= prev.buf.length;
      diskCache.set(file, { mtimeMs: st.mtimeMs, buf });
      diskCacheBytes += buf.length;
      while (
        (diskCache.size > DISK_CACHE_MAX || diskCacheBytes > DISK_CACHE_MAX_BYTES) &&
        diskCache.size > 1
      ) {
        const [k, v] = diskCache.entries().next().value as [
          string,
          DiskCacheValue,
        ];
        diskCache.delete(k);
        diskCacheBytes -= v.buf.length;
      }
    }
    return buf;
  } catch {
    return null;
  }
}
