"use client";

// 词条渲染:用 shadow root 隔离词典 HTML。
// 词典自带的样式(<link> 已由服务端改写为 /api/resource)在 shadow tree 内
// 生效,不会污染页面全局样式;页面样式也不会串入词条。
import { useEffect, useRef } from "react";
import { decodeSpeexToWav } from "@/lib/speex";

// shadow root 内的基础排版(词典自带 CSS 会覆盖)。
const BASE_CSS = `
  :host { display: block; line-height: 1.6; font-size: 15px; overflow-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  audio { max-width: 100%; }
`;

// 音频扩展名:点击直接播放(浏览器原生支持)
const AUDIO_RE = /\.(mp3|wav|ogg)$/i;
// Speex 发音:浏览器原生不支持(仅 Firefox),需要解码成 WAV 播放
const SPX_RE = /\.spx$/i;
// 解码结果(blob URL)缓存,避免同一发音重复解码
const spxBlobCache = new Map<string, string>();

async function playSpx(url: string) {
  try {
    let blobUrl = spxBlobCache.get(url);
    if (!blobUrl) {
      const blob = await decodeSpeexToWav(url);
      blobUrl = URL.createObjectURL(blob);
      spxBlobCache.set(url, blobUrl);
    }
    const audio = new Audio(blobUrl);
    await audio.play();
  } catch (e) {
    console.error("Speex 播放失败:", e);
    window.alert("音频解码失败,无法播放该发音。");
  }
}

export default function EntryView({
  html,
  onNavigate,
}: {
  html: string;
  onNavigate: (word: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // 用 ref 保存最新回调,避免 effect 因回调身份变化反复重绑。
  // 渲染期不可读写 ref(React 19 报错),在 effect 中同步——
  // 每次渲染后更新,事件处理器(点击 shadow 内链接)读取时必然是最新值。
  const navRef = useRef(onNavigate);
  useEffect(() => {
    navRef.current = onNavigate;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let shadow = host.shadowRoot;
    if (!shadow) shadow = host.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = BASE_CSS;
    shadow.append(style);
    // 服务端已消毒(移除 <script>/事件属性);innerHTML 组装 shadow 内容
    const body = document.createElement("div");
    body.innerHTML = html;
    shadow.append(body);

    // 事件监听必须挂在 shadow 内部(body 上),而不是 host 上:
    // 事件越过 shadow boundary 后会被 retarget,host 上的监听器看到
    // 的 e.target 是 host 本身,closest("a") 会找不到 shadow 内的链接。
    // body 随下次 replaceChildren 销毁,listener 一并移除,无需 cleanup。
    const onClick = (e: Event) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("entry://")) {
        e.preventDefault();
        navRef.current(decodeURIComponent(href.slice("entry://".length).split("#")[0]));
      } else if (href.startsWith("/api/resource")) {
        if (AUDIO_RE.test(href)) {
          e.preventDefault();
          new Audio(href).play().catch(() => {});
        } else if (SPX_RE.test(href)) {
          // Speex 发音:解码为 WAV 后播放(异步)
          e.preventDefault();
          void playSpx(href);
        }
      }
    };
    body.addEventListener("click", onClick);
  }, [html]);

  return <div ref={hostRef} className="entry" />;
}
