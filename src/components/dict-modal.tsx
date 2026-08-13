"use client";

// 词典列表弹窗:常驻排序(拖拽 + ↑↓/置顶/置底,实时生效)+ 点击行看详情。
// 详情为内嵌二级弹窗(header XML 信息 + 同名封面);样式按钮独立一列,
// 每行可编辑该词典自定义 CSS。
import { useRef, useState, type HTMLAttributes } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Paintbrush,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CodeEditor from "@uiw/react-textarea-code-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  clearUserCss,
  DictInfoDetail,
  fetchDictInfo,
  fetchUserCss,
  saveUserCss,
} from "@/lib/api";
import { DictEntry, DictInfo, titleHtml } from "@/lib/shared";
import {
  clearUserCssCache,
  setUserCss as setStoreUserCss,
} from "@/lib/user-css-store";

// 详情弹窗的数据:dict-info 接口的 info 恒非空(open 成功才返回),
// 用交集收窄 nullable 以保持渲染处直接访问。
type Detail = DictInfoDetail & { info: DictInfo };

// 行内容(7 列布局):排序把手 + 排序按钮组 + 标题 + 样式按钮 + 版本/类型/词条。
// SortableRow 与 DragOverlay 共用;交互 props 可选,overlay 中不传则纯展示。
type RowHandlers = {
  onMove?: (name: string, dir: -1 | 1) => void;
  onMoveToEdge?: (name: string, to: "top" | "bottom") => void;
  onOpenCss?: (id: number, name: string) => void;
};

function RowContent({
  mdx,
  index,
  total,
  handleProps,
  onMove,
  onMoveToEdge,
  onOpenCss,
}: {
  mdx: DictEntry;
  index: number;
  total: number;
  handleProps?: HTMLAttributes<HTMLElement>;
} & RowHandlers) {
  return (
    <>
      <span
        className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
        {...handleProps}
      >
        <GripVertical className="size-4" />
      </span>
      <span className="flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.stopPropagation(); // 不触发行点击(查看详情)
            onMoveToEdge?.(mdx.name, "top");
          }}
          disabled={index === 0}
          aria-label="置顶"
          title="置顶"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronsUp className="size-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMove?.(mdx.name, -1);
          }}
          disabled={index === 0}
          aria-label="上移"
          title="上移"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMove?.(mdx.name, 1);
          }}
          disabled={index === total - 1}
          aria-label="下移"
          title="下移"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronDown className="size-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveToEdge?.(mdx.name, "bottom");
          }}
          disabled={index === total - 1}
          aria-label="置于底部"
          title="置于底部"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronsDown className="size-4" />
        </button>
      </span>
      <span className="flex min-w-0 items-center">
        <span
          className="truncate font-medium"
          dangerouslySetInnerHTML={{
            __html: titleHtml(mdx.info?.title ?? "", mdx.name),
          }}
        />
      </span>
      <span className="flex items-center">
        <button
          onClick={(e) => {
            e.stopPropagation(); // 不触发行点击(查看详情)
            onOpenCss?.(mdx.id, titleHtml(mdx.info?.title ?? "", mdx.name).replace(/<[^>]*>/g, ""));
          }}
          aria-label="编辑自定义样式"
          title="编辑自定义样式"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Paintbrush className="size-4" />
        </button>
      </span>
      <span className="text-muted-foreground">
        {mdx.info ? `v${mdx.info.version}` : "—"}
      </span>
      <span className="text-muted-foreground">MDX</span>
      <span className="text-muted-foreground">{mdx.info?.entries ?? "—"}</span>
    </>
  );
}

// 可拖拽排序的行:useSortable 提供拖拽状态,listeners/attributes 只绑把手;
// 拖动时原行淡出(opacity-40),DragOverlay 渲染浮动卡片跟随指针,
// 其余行通过 transform/transition 平滑让位。
function SortableRow({
  mdx,
  index,
  total,
  cols,
  isActive,
  onClick,
  onMove,
  onMoveToEdge,
  onOpenCss,
}: {
  mdx: DictEntry;
  index: number;
  total: number;
  cols: string;
  isActive: boolean;
  onClick: (id: number) => void;
} & RowHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mdx.id,
  });
  return (
    <div
      ref={setNodeRef}
      onClick={() => onClick(mdx.id)}
      title="查看详情"
      className={`grid gap-2 border-b px-3 py-2 text-sm transition-colors ${cols} ${
        isActive || isDragging ? "opacity-40" : "hover:bg-muted/50"
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <RowContent
        mdx={mdx}
        index={index}
        total={total}
        handleProps={{ ...attributes, ...listeners }}
        onMove={onMove}
        onMoveToEdge={onMoveToEdge}
        onOpenCss={onOpenCss}
      />
    </div>
  );
}

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
  // dnd-kit 拖拽排序:当前激活(拖动中)的行 id,驱动行淡出与 DragOverlay
  const [activeId, setActiveId] = useState<number | null>(null);

  // 拖拽传感器:拖拽仅由把手触发(把手无点击功能),PointerSensor 不加
  // 距离阈值——distance 约束下 transform 以 pointerdown 坐标为基准,激活前
  // 指针已移动的距离会变成 DragOverlay 的固定偏移(快速拖动时偏移很大,
  // dnd-kit issue #1288)。KeyboardSensor 支持键盘排序(无障碍)。
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as number);
  };
  const onDragCancel = () => setActiveId(null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = rows.findIndex(({ mdx }) => mdx.id === active.id);
    const to = rows.findIndex(({ mdx }) => mdx.id === over.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };
  // 词典详情(点击行弹出)
  const [detail, setDetail] = useState<Detail | null>(null);
  const showDetail = (id: number) => {
    fetchDictInfo(id)
      .then((d) => setDetail(d as Detail))
      .catch(() => setDetail(null));
  };

  // 自定义 CSS 编辑:目标行(词典 id + 显示名)+ 编辑区文本。
  const [cssTarget, setCssTarget] = useState<{ id: number; name: string } | null>(null);
  const [cssText, setCssText] = useState("");
  const [cssDirty, setCssDirty] = useState(false);
  // 先加载当前 CSS 再打开弹窗:CodeEditor 挂载时 value 已就绪、首帧即高亮。
  // (该库经 useEffect 把外部 value 同步进内部 state,若挂载后才加载,
  //  首帧会渲染旧值,出现"打开瞬间未高亮"的一帧)
  // 请求序号防竞态:快速切换点击不同行时,只接受最后一次请求的返回。
  const cssSeq = useRef(0);
  const openCssEditor = (id: number, name: string) => {
    const seq = ++cssSeq.current;
    setCssDirty(false);
    fetchUserCss(id)
      .then((j) => {
        if (seq !== cssSeq.current) return;
        setCssText(j.css);
        setCssTarget({ id, name });
      })
      .catch(() => {
        if (seq !== cssSeq.current) return;
        setCssText("");
        setCssTarget({ id, name });
      });
  };
  const saveCss = () => {
    if (!cssTarget) return;
    void saveUserCss(cssTarget.id, cssText).then(() => {
      // 更新 store:notify 所有已挂载卡片立即重渲染(无需刷新)
      setStoreUserCss(cssTarget.id, cssText);
      setCssTarget(null);
    });
  };
  const clearCss = () => {
    if (!cssTarget) return;
    void clearUserCss(cssTarget.id).then(() => {
      clearUserCssCache(cssTarget.id);
      setCssTarget(null);
    });
  };

  // 固定 7 列:把手 / 排序按钮组 / 标题 / 样式按钮 / 版本 / 类型 / 词条。
  // 样式按钮独立一列,不挤占其他列;排序功能常驻、实时生效。
  const cols = "grid-cols-[2rem_5.5rem_minmax(0,1fr)_2.5rem_4rem_4rem_5rem]";

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
            <span />
            <span />
            <span>标题</span>
            <span />
            <span>版本</span>
            <span>类型</span>
            <span>词条</span>
          </div>
          <div className="nice-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
              <SortableContext
                items={rows.map(({ mdx }) => mdx.id)}
                strategy={verticalListSortingStrategy}
              >
                {rows.map(({ mdx }, i) => (
                  <SortableRow
                    key={mdx.id}
                    mdx={mdx}
                    index={i}
                    total={rows.length}
                    cols={cols}
                    isActive={activeId === mdx.id}
                    onClick={showDetail}
                    onMove={onMove}
                    onMoveToEdge={onMoveToEdge}
                    onOpenCss={openCssEditor}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeId !== null &&
                  (() => {
                    const idx = rows.findIndex(({ mdx }) => mdx.id === activeId);
                    if (idx < 0) return null;
                    const { mdx } = rows[idx];
                    return (
                      <div
                        className={`grid gap-2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg ${cols}`}
                      >
                        <RowContent mdx={mdx} index={idx} total={rows.length} />
                      </div>
                    );
                  })()}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
        {/* 表格 footer:说明 */}
        <div className="flex items-center border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            拖拽把手或使用按钮调整顺序,实时生效;点击行可查看详情。
          </span>
        </div>
      </DialogContent>

      {/* 词典详情弹窗(header XML 信息 + 同名封面) */}
      {detail && (
        <Dialog open onOpenChange={(v) => !v && setDetail(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle
                dangerouslySetInnerHTML={{ __html: detail.titleHtml }}
              />
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

      {/* 自定义 CSS 编辑弹窗:shadow root 内生效,只作用于该词典词条 */}
      {cssTarget && (
        <Dialog open onOpenChange={(v) => !v && setCssTarget(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>自定义样式 — {cssTarget.name}</DialogTitle>
              <DialogDescription>
                写在 shadow root 内、词典自带样式之后,仅作用于该词典词条;直接写
                选择器即可(如 .phonetic {"{"} color: red; {"}"})。
              </DialogDescription>
            </DialogHeader>
            <CodeEditor
              value={cssText}
              language="css"
              onChange={(e) => {
                setCssText(e.target.value);
                setCssDirty(true);
              }}
              placeholder="/* 例如: */
.phonetic { color: #c0392b; font-weight: 700; }"
              padding={10}
              minHeight={352}
              className="css-editor"
              style={{
                fontSize: 12,
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
                backgroundColor: "transparent",
              }}
            />
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" onClick={clearCss} disabled={!cssDirty && !cssText.trim()}>
                清除样式
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCssTarget(null)}>
                  取消
                </Button>
                <Button onClick={saveCss} disabled={!cssDirty}>
                  保存
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
