"use client";

// 单本词典的查询结果卡(可折叠)。React.memo:item/highlight/回调不变时
// 不重渲染;onNavigate 由父级 useCallback 保证引用稳定。
// 每词典自定义 CSS:经 store 管理(缓存 + 订阅)。挂载时若未加载则 fetch;
// 保存/清除样式时 store notify,已挂载卡片立即重渲染(见 user-css-store.ts)。
import { memo, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import EntryView from "@/components/entry-view";
import { AnimatedContent } from "@/components/ui/animated-content";
import { fetchUserCss } from "@/lib/api";
import {
  getUserCss,
  isUserCssLoaded,
  setUserCss as setStoreUserCss,
  subscribeUserCss,
} from "@/lib/user-css-store";
import { LookupItem } from "@/lib/shared";

function ResultCard({
  item,
  highlight,
  onNavigate,
}: {
  item: LookupItem;
  highlight: boolean;
  onNavigate: (w: string) => void;
}) {
  // 默认展开;点击标题栏收起/展开
  const [open, setOpen] = useState(true);
  // 用户自定义 CSS(空串 = 无自定义)。初始从 store 读;
  // store notify 时 setState 触发重渲染,让 EntryView 拿到最新样式。
  const [userCss, setUserCss] = useState(() => getUserCss(item.dictId));

  useEffect(() => {
    // 订阅 store:保存/清除样式后立即重渲染(无需刷新)。
    const unsubscribe = subscribeUserCss(() => {
      setUserCss(getUserCss(item.dictId));
    });
    // 首次:未加载过才 fetch,结果写入 store(notify 会再触发上面订阅)。
    if (!isUserCssLoaded(item.dictId)) {
      let cancelled = false;
      fetchUserCss(item.dictId)
        .then((j) => {
          if (!cancelled) setStoreUserCss(item.dictId, j.css);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }
    return unsubscribe;
  }, [item.dictId]);

  return (
    <section
      id={`result-${item.dictId}`}
      className={`scroll-mt-20 rounded-lg border bg-card text-card-foreground transition-shadow ${
        highlight ? "ring-2 ring-blue-400 highlight-pulse" : ""
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b px-4 py-2 text-left hover:bg-muted/50"
      >
        <span
          className="font-semibold"
          dangerouslySetInnerHTML={{ __html: item.titleHtml }}
        />
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <AnimatedContent
          distance={6}
          duration={0.22}
          ease="power2.out"
          className="p-4"
        >
          <EntryView html={item.html ?? ""} userCss={userCss} onNavigate={onNavigate} />
        </AnimatedContent>
      )}
    </section>
  );
}

export default memo(ResultCard);