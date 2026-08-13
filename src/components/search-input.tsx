"use client";

// 搜索输入框 + 联想下拉(键盘导航:Enter 查询、↑↓ 移动、Esc 关闭;
// 点击下拉外部自动收起)。
import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { AnimatedContent } from "@/components/ui/animated-content";

export default function SearchInput({
  query,
  onQuery,
  suggestions,
  activeSug,
  setActiveSug,
  onLookup,
  onHide,
}: {
  query: string;
  onQuery: (v: string) => void;
  suggestions: string[];
  activeSug: number;
  setActiveSug: (n: number) => void;
  onLookup: (w: string) => void;
  onHide: () => void;
}) {
  // 容器引用:用于“点击外部收起下拉”的命中判定。
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 用 mousedown(而非 click):与下拉项的 onMouseDown 同一事件时机,
    // 避免点击下拉项先触发这里导致 blur/隐藏竞态。
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onHide();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [onHide]);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (activeSug >= 0 && suggestions[activeSug]) onLookup(suggestions[activeSug]);
            else onLookup(query);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveSug(Math.min(activeSug + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveSug(Math.max(activeSug - 1, 0));
          } else if (e.key === "Escape") {
            onHide();
          }
        }}
        placeholder="输入单词,一次查询全部词典…"
        className="h-12 bg-background text-lg"
      />
      {suggestions.length > 0 && (
        <AnimatedContent
          distance={4}
          duration={0.18}
          ease="power2.out"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {suggestions.map((s, i) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                onLookup(s);
              }}
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                i === activeSug ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              {s}
            </button>
          ))}
        </AnimatedContent>
      )}
    </div>
  );
}
