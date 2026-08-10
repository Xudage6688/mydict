# speex.js

浏览器端 Speex 解码器(供 `src/lib/speex.ts` 使用)。

**来源**:https://github.com/jpemartins/speex.js (dist/speex.js)

- 用 Emscripten 将 [Speex](https://www.speex.org/) 1.2.0RC 编译为 asm.js
- 暴露全局 `window.Speex` / `window.libspeex`(非模块脚本,经 `<script>` 加载)
- Speex 本身为 **BSD-3-Clause** 许可

**为什么需要**:MDX 词典的发音多为 Speex(.spx)编码,仅 Firefox 原生支持;
Chrome/Edge/Safari 无法直接播放,需在浏览器端解码为 WAV。
