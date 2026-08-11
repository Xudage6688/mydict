"use client";

// 单本词典的查询结果卡(可折叠)。React.memo:item/highlight/回调不变时
// 不重渲染;onNavigate 由父级 useCallback 保证引用稳定。
import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import EntryView from "@/components/entry-view";
import { AnimatedContent } from "@/components/ui/animated-content";
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
        <span className="font-semibold">{item.title}</span>
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
          <EntryView html={item.html ?? ""} onNavigate={onNavigate} />
        </AnimatedContent>
      )}
    </section>
  );
}

export default memo(ResultCard);
