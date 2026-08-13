// mdict.dll / libmdict.so 的 koffi 绑定层。
//
// 调用约定(见 mdictcc 的 src/capi.cpp):
//   - 所有文本 UTF-8;句柄为不透明 void*
//   - 返回 char*/void* 的接口返回引擎 malloc 的内存,必须用 mdict_free 释放
//   - 错误不抛异常:open 失败通过 errbuf 回填;lookup/suggest 失败返回 null/空
import koffi from "koffi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DictInfo } from "./shared";

// 共享库路径:MDICT_LIB 环境变量优先,默认取与 mdictcc 平级的构建产物
// (../mdictcc/build)。开发时可在项目根 .env.local 里写 MDICT_LIB=... 覆盖。
export function mdictLibPath(): string {
  if (process.env.MDICT_LIB) return process.env.MDICT_LIB;
  const name = process.platform === "win32" ? "mdict.dll" : "libmdict.so";
  // 仓库内置的 vendored 构建产物(随 git 追踪)
  const vendored = path.join(process.cwd(), "vendor", name);
  if (fs.existsSync(vendored)) return vendored;
  // 兜底:与 mdictcc 源码工程平级的构建产物(../mdictcc/build)
  return path.join(process.cwd(), "..", "mdictcc", "build", name);
}

// 引擎索引缓存目录(集中式,对齐 goldendict 思路):索引写入 <dir>/<md5hex>,
// 词典目录零写入。默认用户缓存目录,可用环境变量 MDICT_INDEX_DIR 覆盖。
// 注:当前 vendored 引擎本机未导出 mdict_set_index_dir(旧版构建),
// 该目录暂仅供 user-css 存储定位(见 user-css.ts),索引缓存未启用。
export function indexDirPath(): string {
  if (process.env.MDICT_INDEX_DIR) return process.env.MDICT_INDEX_DIR;
  return path.join(os.homedir(), ".mdictfe", "index");
}

type Lib = ReturnType<typeof koffi.load>;
let _lib: Lib | null = null;
let _freeFn: ((ptr: unknown) => void) | null = null;

function getLib(): Lib {
  if (_lib) return _lib;
  const p = mdictLibPath();
  if (!fs.existsSync(p)) {
    throw new Error(`mdict 共享库不存在: ${p}(可用环境变量 MDICT_LIB 指定)`);
  }
  _lib = koffi.load(p);
  _freeFn = _lib.func("void mdict_free(void*)");
  return _lib;
}
export { getLib };

// 读取引擎分配的 C 字符串并释放。
function takeCString(ptr: unknown): string {
  if (!ptr) return "";
  const s = koffi.decode(ptr as any, "char", -1);
  _freeFn!(ptr);
  return s;
}

interface MdictFuncs {
  info: (h: bigint) => unknown;
  lookupBuf: (h: bigint, word: string, outLen: (number | null)[]) => unknown;
  suggest: (h: bigint, prefix: string, limit: number) => unknown;
  close: (h: bigint) => void;
}

export class MdictDict {
  readonly handle: bigint;
  private readonly fn: MdictFuncs;
  private _info: DictInfo | null = null;

  constructor(lib: Lib, handle: bigint) {
    this.handle = handle;
    this.fn = {
      info: lib.func("void* mdict_info(void*)"),
      lookupBuf: lib.func(
        "void* mdict_lookup_buf(void*, const char*, _Out_ size_t*)",
      ),
      suggest: lib.func("void* mdict_suggest(void*, const char*, int)"),
      close: lib.func("void mdict_close(void*)"),
    };
  }

  static open(lib: Lib, filePath: string): MdictDict {
    const open = lib.func(
      "void* mdict_open(const char* path, char* errbuf, size_t errlen)",
    );
    const errbuf = Buffer.alloc(512);
    const h = open(filePath, errbuf, 512);
    if (!h) {
      const msg = koffi.decode(errbuf, "char", -1) || "unknown error";
      throw new Error(`打开词典失败(${path.basename(filePath)}): ${msg}`);
    }
    return new MdictDict(lib, h);
  }

  info(): DictInfo {
    if (this._info) return this._info;
    this._info = JSON.parse(takeCString(this.fn.info(this.handle))) as DictInfo;
    return this._info;
  }

  // 二进制安全查词:命中返回字节,未命中返回 null。
  lookupBuf(word: string): Uint8Array | null {
    const outLen: (number | null)[] = [null];
    const p = this.fn.lookupBuf(this.handle, word, outLen);
    if (!p) return null;
    const bytes = koffi.decode(p as any, "uint8_t", outLen[0] as number);
    _freeFn!(p);
    return bytes;
  }

  lookup(word: string): string | null {
    const buf = this.lookupBuf(word);
    if (!buf) return null;
    return Buffer.from(buf).toString("utf8");
  }

  suggest(prefix: string, limit: number): string[] {
    const s = takeCString(this.fn.suggest(this.handle, prefix, limit));
    return s.length === 0 ? [] : s.split("\n");
  }

  /**
   * 关闭引擎句柄并释放 mmap。本应用词典句柄进程内常驻(惰性 open 后
   * 一直复用,查询/资源/联想都依赖它),close 仅在需要释放资源时调用。
   */
  close(): void {
    this.fn.close(this.handle);
  }
}
