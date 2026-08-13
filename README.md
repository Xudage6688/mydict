# mdictfe

基于 Next.js(App Router + TypeScript + Tailwind)的 MDX/MDD 词典查询应用。
后端在 Next.js 进程内通过 [koffi](https://koffi.dev) 调用 **mdictcc** 引擎共享库
(`mdict.dll` / `libmdict.so`),词典句柄按 LRU 缓存、淘汰即关闭引擎释放 mmap,
查询亚毫秒级;启动仅预载小词典(≤20MB),大词典按需惰性打开。

## 功能

- 多词典查词:按词典分组渲染词条 HTML(先消毒再展示)
- 资源渲染:词条内 CSS/图片/音频自动改写为 `/api/resource` 从 MDD 读取;
  `entry://` 互链点击跳转;`sound://`(mp3/wav/ogg)点击播放
- 输入联想:前缀匹配下拉(键盘 ↑↓ 选择、Enter 确认、Esc 关闭)
- 拼写近似:查无此词时给出编辑距离 ≤3 的建议
- 词典管理:弹窗列出全部词典(递归扫描目录),点击切换当前词典
- 历史与收藏:localStorage 持久化,点击即查
- 内存管理:词典句柄 LRU 上限自动 `close` 引擎;词条/资源/Disk 缓存均有字节上限;
  `POST /api/dicts/gc`(需 `MDICT_GC_TOKEN` 鉴权)可手动关闭全部句柄并触发 V8 GC
- 容错:词典打开失败(加密/损坏/不支持)不影响其他词典,列表标记原因

## 环境要求

- Node.js ≥ 18
- **mdictcc 引擎共享库**,默认路径为 `../mdictcc/build/mdict.dll`(Windows)
  或 `../mdictcc/build/libmdict.so`(Linux)。构建方式见 mdictcc 的 README
  (Windows:`python tools/build.py`;Linux:CMake 或 `make build/libmdict.so`)

## 运行

```bash
npm install
npm run dev        # 开发模式 http://localhost:3000
# 或
npm run build && npm run start   # 生产模式
```

## 配置(环境变量)

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MDICT_LIB` | `../mdictcc/build/mdict.{dll,so}` | 引擎共享库路径 |
| `MDICT_DIR` | `./dicts` | 词典目录(递归扫描 `.mdx`/`.mdd`);不设置时默认项目根目录的 `dicts/` |
| `MDICT_FILTER` | _(空)_ | 词典过滤:逗号分隔关键词,子串(不区分大小写)匹配文件名;设置后仅收录匹配的词典,可在共享大目录里只启用需要的几本 |

开发时可在项目根创建 `.env.local` 覆盖,例如:

```
MDICT_LIB=/path/to/mdict.dll
MDICT_DIR=/path/to/dicts
MDICT_FILTER=LDOCE6,CC-CEDICT,BBI
```

## 架构

```
浏览器
  │  /api/dicts /api/lookup /api/resource /api/suggest /api/dicts/gc
  ▼
Next.js Route Handlers(src/app/api/*)
  │  koffi FFI(函数绑定进程级单例)
  ▼
mdictcc 引擎(mdict.dll / libmdict.so)
  │
  ▼
词典文件(.mdx/.mdd,只读)
```

- `src/lib/mdict.ts`  — koffi 绑定层(单例化函数绑定、句柄封装、二进制安全 lookup、前缀联想)
- `src/lib/dicts.ts`  — 词典管理器:递归扫描、惰性 open、句柄 LRU 淘汰(globalThis 单例)
- `src/lib/html.ts`   — 词条 HTML 消毒 + 资源引用改写(路径型 /api/resource)
- `src/lib/resource.ts` — MDD 资源 key 候选解析(共享给两个 resource 路由)
- `src/components/search-page.tsx` — 搜索页(联想/结果/弹窗/历史)

设计要点:词典列表请求不阻塞(纯扫描),查询某词典时才 open 并缓存;
MDD 资源 key 前缀写法因生成器而异(`\`/`/`/裸名),`/api/resource` 按候选序列兼容。

句柄内存上限 24 本,超出(需启用的词典 >24 本)才淘汰最久未用并 `close` 引擎(释放 mmap),
再次查询惰性重开;词条缓存上限 50MB(按 UTF-8 字节)、MDD 缓存 64MB、磁盘资源缓存 32MB,
均按字节淘汰最旧。启动预热仅 open ≤20MB 的词典,大词典(如 LDOCE6 的 1.3GB MDD)查询时才加载。

资源 URL 采用**路径型** `/api/resource/<dictId>/<path>`(而非 `?dict=&path=`):
CSS 内部的相对 `url()` 以 CSS 文件自身的 URL 为基准解析,路径型让该基准
落在 `/api/resource/<dictId>/` 下,CSS 内嵌引用自动解析到正确资源,
无需服务端改写 CSS 内容。旧 query 形态路由保留兼容。

资源读取顺序:**同名 MDD 优先,查不到时回退到词典文件所在目录的磁盘文件**
(部分词典资源直接外置,如 `简明必应版-css/concise-bing.css`、
`英汉百科知识辞典/英汉百科知识辞典.jpg`);磁盘查找拒绝 `..` 路径穿越。
无同名 MDD 的词典以自身 id 作为资源入口。

## 部署与内存

生产建议 `next build` 后用 `next start` 启动,并启用手动 GC 与堆上限:

```bash
NODE_OPTIONS="--max-old-space-size=2048 --expose-gc" npm run start
```

- `--expose-gc` 是 `POST /api/dicts/gc` 必需的(否则该端点仅关句柄、跳过硬 GC)
- `--max-old-space-size` 把 V8 堆封顶,避免长期运行无限膨胀
- GC 端点**默认禁用**:设置环境变量 `MDICT_GC_TOKEN` 后,请求须带
  `x-gc-token: <token>` 头(shell 下:`curl -X POST -H "x-gc-token: <token>" \
  http://localhost:3000/api/dicts/gc`);未配置 token 一律返回 403。
  它关闭全部词典句柄并触发 GC,句柄随后按需惰性重开,属自愈操作
- 可配定时任务每 6 小时调用一次,顺带记录 `process.memoryUsage()` 观察趋势

实测(12 本词典,含 1.3GB LDOCE6,冷启动进程):全量打开后工作集约 134MB,
GC 后约 96MB。此为冷启动数字,与旧版长跑 20h 后观测到的 1.36GB 基线的差异
正来自本节的句柄按需加载 + 缓存字节上限(内存增长已被封顶)。

## 已知限制

- 若词典打包不完整(CSS 内 `url()` 引用、词条内 `<img>` 指向的资源不在 MDD 中),
  对应资源返回 404(实测柯林斯双解 CSS 引用 39 个资源均未收录)
- MDD 的 `.spx`(Speex)音频浏览器不支持,不会播放;`.mp3/.wav/.ogg` 正常
- 词条 HTML 仅做轻量消毒(移除 `<script>` 与事件属性),不保证对抗恶意词典
- 引擎为 Windows/Linux 原生构建,需在对应平台编译;GBK/Big5 词典在 Linux 上
  依赖引擎的编码转换支持(Windows 用系统 API,Linux 为占位)
