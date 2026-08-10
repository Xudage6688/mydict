"use client";

// 最近查询 chips(可删除)。独立 memo:输入击键时历史区不重渲染。
import { memo } from "react";
import { X } from "lucide-react";

function HistoryChips({
  words,
  onPick,
  onRemove,
}: {
  words: string[];
  onPick: (w: string) => void;
  onRemove: (w: string) => void;
}) {
  if (words.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-semibold text-muted-foreground">最近查询</h2>
      <div className="flex flex-wrap gap-2">
        {words.map((w) => (
          <div
            key={w}
            className="group relative flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-secondary-foreground"
          >
            <button onClick={() => onPick(w)} className="text-sm hover:underline">
              {w}
            </button>
            {/* 删除角标:红色小圆圈,悬浮 chip 时才显示 */}
            <button
              onClick={() => onRemove(w)}
              aria-label={`删除 ${w}`}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-red-600"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default memo(HistoryChips);
