"use client";

// 词典列表弹窗:排序模式(拖拽 + ↑↓/置顶/置底)与普通模式(点击行看详情)。
// 详情为内嵌二级弹窗(header XML 信息 + 同名封面)。
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DictInfoDetail, fetchDictInfo } from "@/lib/api";
import { DictEntry, DictInfo, dictDisplayName } from "@/lib/shared";

// 详情弹窗的数据:dict-info 接口的 info 恒非空(open 成功才返回),
// 用交集收窄 nullable 以保持渲染处直接访问。
type Detail = DictInfoDetail & { info: DictInfo };

export default function DictModal({
  rows,
  open,
  onOpenChange,
  onMove,
  onReorder,
  onMoveToEdge,
}: {
  rows: { mdx: DictEntry; mdd?: DictEntry }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onMove: (name: string, dir: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onMoveToEdge: (name: string, to: "top" | "bottom") => void;
}) {
  // 排序模式:开启后显示拖拽把手(第一列)与 ↑↓ 微调按钮
  const [sorting, setSorting] = useState(false);
  // 拖拽源行索引:用 state(渲染期需要参与高亮判断,ref 不可在渲染期读取)
  const [dragFrom, setDragFrom] = useState(-1);
  const [dragOver, setDragOver] = useState(-1);
  // 词典详情(非排序模式点击行弹出)
  const [detail, setDetail] = useState<Detail | null>(null);
  const showDetail = (id: number) => {
    fetchDictInfo(id)
      .then((d) => setDetail(d as Detail))
      .catch(() => setDetail(null));
  };

  const cols = sorting
    ? "grid-cols-[2rem_5.5rem_minmax(0,1fr)_4rem_4rem_5rem]"
    : "grid-cols-[minmax(0,1fr)_4rem_4rem_5rem]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-3rem)] w-full max-w-5xl sm:max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>词典列表</DialogTitle>
          <DialogDescription>
            共 {rows.length} 本词典;顺序决定搜索结果卡片排列。
          </DialogDescription>
        </DialogHeader>
        {/* 固定表头 + 滚动内容的两段式布局(避免 table sticky 渲染跳动) */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={`grid gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground ${cols}`}
          >
            {sorting && <span />}
            {sorting && <span />}
            <span>标题</span>
            <span>版本</span>
            <span>类型</span>
            <span>词条</span>
          </div>
          <div className="nice-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
            {rows.map(({ mdx }, i) => (
              <div
                key={mdx.id}
                draggable={sorting}
                onClick={sorting ? undefined : () => showDetail(mdx.id)}
                title={sorting ? undefined : "查看详情"}
                onDragStart={
                  sorting
                    ? (e) => {
                        setDragFrom(i);
                        e.dataTransfer.effectAllowed = "move";
                      }
                    : undefined
                }
                onDragOver={
                  sorting
                    ? (e) => {
                        e.preventDefault();
                        setDragOver(i);
                      }
                    : undefined
                }
                onDragLeave={sorting ? () => setDragOver(-1) : undefined}
                onDrop={
                  sorting
                    ? (e) => {
                        e.preventDefault();
                        if (dragFrom >= 0) onReorder(dragFrom, i);
                        setDragFrom(-1);
                        setDragOver(-1);
                      }
                    : undefined
                }
                onDragEnd={sorting ? () => { setDragFrom(-1); setDragOver(-1); } : undefined}
                className={`grid gap-2 border-b px-3 py-2 text-sm transition-colors ${cols} ${
                  dragOver === i && i !== dragFrom ? "bg-muted/70" : "hover:bg-muted/50"
                }`}
              >
                {sorting && (
                  <span className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing">
                    <GripVertical className="size-4" />
                  </span>
                )}
                {sorting && (
                  <span className="flex items-center gap-0.5">
                    <button
                      onClick={() => onMoveToEdge(mdx.name, "top")}
                      disabled={i === 0}
                      aria-label="置顶"
                      title="置顶"
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <ChevronsUp className="size-4" />
                    </button>
                    <button
                      onClick={() => onMove(mdx.name, -1)}
                      disabled={i === 0}
                      aria-label="上移"
                      title="上移"
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      onClick={() => onMove(mdx.name, 1)}
                      disabled={i === rows.length - 1}
                      aria-label="下移"
                      title="下移"
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      onClick={() => onMoveToEdge(mdx.name, "bottom")}
                      disabled={i === rows.length - 1}
                      aria-label="置于底部"
                      title="置于底部"
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <ChevronsDown className="size-4" />
                    </button>
                  </span>
                )}
                <span className="truncate font-medium">
                  {dictDisplayName(mdx.info?.title ?? "", mdx.name)}
                </span>
                <span className="text-muted-foreground">
                  {mdx.info ? `v${mdx.info.version}` : "—"}
                </span>
                <span className="text-muted-foreground">MDX</span>
                <span className="text-muted-foreground">{mdx.info?.entries ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
        {/* 表格 footer:排序模式切换按钮 */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {sorting ? "拖拽把手或按钮调整顺序,顺序决定搜索结果卡片排列" : "顺序决定搜索结果卡片排列"}
          </span>
          <Button
            variant={sorting ? "default" : "outline"}
            size="sm"
            onClick={() => setSorting((s) => !s)}
          >
            {sorting ? "完成" : "排序"}
          </Button>
        </div>
      </DialogContent>

      {/* 词典详情弹窗(header XML 信息 + 同名封面) */}
      {detail && (
        <Dialog open onOpenChange={(v) => !v && setDetail(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>{detail.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {detail.cover && (
                <img
                  src={`/api/resource/${detail.id}/${encodeURIComponent(detail.cover)}`}
                  alt="词典封面"
                  className="h-24 w-24 rounded-md border object-contain"
                />
              )}
              <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">版本</dt>
                <dd>v{detail.info.version}</dd>
                <dt className="text-muted-foreground">编码</dt>
                <dd>{detail.info.encoding}</dd>
                <dt className="text-muted-foreground">加密</dt>
                <dd>{detail.info.encrypted === 0 ? "否" : detail.info.encrypted}</dd>
                <dt className="text-muted-foreground">格式</dt>
                <dd>{detail.info.format || "—"}</dd>
                <dt className="text-muted-foreground">大小写敏感</dt>
                <dd>{detail.info.case_sensitive ? "是" : "否"}</dd>
                <dt className="text-muted-foreground">Compact</dt>
                <dd>{detail.info.compact ? "是" : "否"}</dd>
                <dt className="text-muted-foreground">词条数</dt>
                <dd>{detail.info.entries.toLocaleString()}</dd>
                <dt className="text-muted-foreground">文件</dt>
                <dd className="break-all text-muted-foreground">{detail.path}</dd>
              </dl>
              {detail.info.description && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs leading-relaxed">
                  {detail.info.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
