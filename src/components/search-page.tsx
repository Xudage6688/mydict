"use client";

// 词典搜索页(编排层):组装 hooks 与子组件。
// 查询/联想/历史/排序逻辑见 src/lib/hooks.ts;各 UI 区块为独立组件:
// SearchInput / ResultCard / MissPanel / DictModal / HistoryChips。
import { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDicts } from "@/lib/api";
import { DictEntry, MDX_EXT_RE } from "@/lib/shared";
import {
  useDictOrder,
  useHistory,
  useLookup,
  useSuggestions,
} from "@/lib/hooks";
import SearchInput from "@/components/search-input";
import ResultCard from "@/components/result-card";
import MissPanel from "@/components/miss-panel";
import DictModal from "@/components/dict-modal";
import HistoryChips from "@/components/history-chips";

export default function SearchPage() {
  const [dicts, setDicts] = useState<DictEntry[]>([]);
  const [sugDict, setSugDict] = useState<number>(-1); // 联想用词典(首个可用 MDX)
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const { history, record, remove } = useHistory();
  const { results, loading, lookup, clear } = useLookup(record);
  const { suggestions, activeSug, setActiveSug, trigger, hide } =
    useSuggestions(sugDict);
  const { orderIdx, rows, nameOf, moveDict, reorder, moveToEdge } =
    useDictOrder(dicts);

  // 词典列表 + 联想词典选择
  useEffect(() => {
    fetchDicts()
      .then((j) => {
        setDicts(j.dicts);
        const first = j.dicts.find((d) => MDX_EXT_RE.test(d.name));
        if (first) setSugDict(first.id);
      })
      .catch(() => setDicts([]));
  }, []);

  // 初始加载恢复 URL 中的查询词;监听浏览器后退/前进(popstate)
  useEffect(() => {
    const q0 = new URL(window.location.href).searchParams.get("q") ?? "";
    if (q0) {
      setQuery(q0);
      lookup(q0);
    }
    const onPop = () => {
      const q = new URL(window.location.href).searchParams.get("q") ?? "";
      setQuery(q);
      if (q) lookup(q);
      else clear();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [lookup, clear]);

  // 输入变化:更新输入框 + 触发联想(防抖在 useSuggestions 内)
  const onQuery = (v: string) => {
    setQuery(v);
    trigger(v);
  };
  // 统一查询入口(回车/联想选中/历史/未命中近似/entry 互链):设置输入 + 查询
  const onLookup = useCallback(
    (w: string) => {
      setQuery(w);
      hide();
      lookup(w);
    },
    [lookup, hide],
  );

  // 结果按自定义词典顺序重排
  const sortedResults = useMemo(
    () =>
      [...results].sort((a, b) => {
        const ia =
          orderIdx.get(nameOf(a.dictId).toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        const ib =
          orderIdx.get(nameOf(b.dictId).toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        return ia - ib;
      }),
    [results, orderIdx, nameOf],
  );

  // 右侧词典索引:点击跳转到对应结果卡并短暂高亮
  const jumpTo = (dictId: number) => {
    document
      .getElementById(`result-${dictId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlight(dictId);
    window.setTimeout(() => setHighlight(-1), 1600);
  };

  const miss = results.length === 0 && query.trim().length > 0 && !loading;

  return (
    <div className="min-h-screen">
      {/* 全页 sticky header:搜索框常驻顶部 */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-4 py-2">
          <SearchInput
            query={query}
            onQuery={onQuery}
            suggestions={suggestions}
            activeSug={activeSug}
            setActiveSug={setActiveSug}
            onLookup={onLookup}
            onHide={hide}
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-4">
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">
            {loading && (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}

            {miss && <MissPanel word={query.trim()} onLookup={onLookup} />}

            <main className="space-y-4">
              {sortedResults.map((r) => (
                <ResultCard
                  key={r.dictId}
                  item={r}
                  highlight={highlight === r.dictId}
                  onNavigate={onLookup}
                />
              ))}
            </main>

            <HistoryChips
              words={history}
              onPick={onLookup}
              onRemove={remove}
            />
          </div>

          {results.length > 0 && (
            <aside className="sticky top-20 hidden w-52 shrink-0 lg:block">
              <div className="flex max-h-[calc(100vh-6rem)] flex-col rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    命中词典
                  </h3>
                  {/* 词典列表入口:详情图标,打开管理弹窗 */}
                  <button
                    onClick={() => setShowModal(true)}
                    aria-label="词典列表"
                    title="词典列表"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <List className="size-4" />
                  </button>
                </div>
                {/* 列表独立滚动(原生 overflow + nice-scroll:滚动条默认隐藏,悬停显示) */}
                <div className="nice-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <ul className="space-y-0.5">
                    {sortedResults.map((r) => (
                      <li key={r.dictId}>
                        <button
                          onClick={() => jumpTo(r.dictId)}
                          title={r.title}
                          className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          {r.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      <DictModal
        rows={rows}
        open={showModal}
        onOpenChange={setShowModal}
        onMove={moveDict}
        onReorder={reorder}
        onMoveToEdge={moveToEdge}
      />
    </div>
  );
}
