// 浏览器端 Speex(.spx)解码:Ogg demux → 解析 Speex 头 → Speex.decode → WAV Blob。
//
// 背景:MDX 词典的发音多为 Speex 编码(仅 Firefox 原生支持),Chrome/Edge/Safari
// 播不了。这里用 public/speex/speex.js(emscripten 编译的 libspeex asm.js,
// 非模块脚本,加载后暴露 window.Speex)在浏览器端解码成 WAV 播放。
//
// 链路:fetch .spx → Ogg 页剥离(按 lacing 切包)→ Speex 头(rate/mode)
//      → 跳过 header/comment 包 → Speex.decode(包数据, 各包长度)
//      → Float32Array(样本) → 16bit WAV Blob。

let scriptPromise: Promise<void> | null = null;

/** 惰性加载 speex.js(首次需要解码时才加载,避免首屏开销)。 */
export function loadSpeex(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/speex/speex.js";
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("speex.js 加载失败"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Ogg 容器剥离:按 lacing 值切分页内包,支持跨页续包;返回各包字节。 */
function oggPackets(buf: Uint8Array): Uint8Array[] {
  const pkts: Uint8Array[] = [];
  let cur: Uint8Array[] | null = null;
  let curLen = 0;
  let off = 0;
  while (off + 27 <= buf.length) {
    if (buf[off] !== 0x4f || buf[off + 1] !== 0x67 || buf[off + 2] !== 0x67 || buf[off + 3] !== 0x53) {
      break; // 非 OggS 页头,停止
    }
    const nseg = buf[off + 26];
    const segOff = off + 27;
    let p = segOff + nseg;
    for (let i = 0; i < nseg; i++) {
      const l = buf[segOff + i];
      if (l === 0 && !cur) continue; // 空 lacing
      if (!cur) {
        cur = [];
        curLen = 0;
      }
      cur.push(buf.subarray(p, p + l));
      curLen += l;
      p += l;
      if (l < 255) {
        // 包结束:合并各段
        const merged = new Uint8Array(curLen);
        let k = 0;
        for (const part of cur) {
          merged.set(part, k);
          k += part.length;
        }
        pkts.push(merged);
        cur = null;
        curLen = 0;
      }
    }
    off = p;
  }
  return pkts;
}

/** 解析 Speex 头(前 80 字节,int32 LE):采样率与模式。 */
function parseSpeexHeader(p: Uint8Array): { rate: number; mode: number } {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return {
    rate: dv.getInt32(36, true),
    mode: dv.getInt32(40, true),
  };
}

/** Float32 样本(-1..1)封装为 16bit PCM WAV Blob。 */
function pcmToWav(samples: Float32Array, sampleRate: number): Blob {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // 单声道
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ws(36, "data");
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** 解码 /api/resource 的 .spx 为可播放的 WAV Blob。 */
export async function decodeSpeexToWav(url: string): Promise<Blob> {
  await loadSpeex();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`资源请求失败 HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const pkts = oggPackets(buf);
  if (pkts.length < 3) throw new Error("无效的 Speex 音频");
  const { rate, mode } = parseSpeexHeader(pkts[0]);
  const audioPkts = pkts.slice(2); // 跳过 Speex 头与 comment 包
  const segments = audioPkts.map((p) => p.length);
  const data = new Uint8Array(audioPkts.reduce((a, p) => a + p.length, 0));
  let k = 0;
  for (const p of audioPkts) {
    data.set(p, k);
    k += p.length;
  }
  const Speex = (window as unknown as { Speex: new (o: object) => { decode(d: Uint8Array, seg: number[][]): Float32Array } }).Speex;
  const decoder = new Speex({ sample_rate: rate, mode });
  const samples = decoder.decode(data, [segments]);
  return pcmToWav(samples, rate);
}
