// 客户端自定义 hooks:查询(URL 同步 + 竞态保护)、联想(防抖 + 取消)、
// 查询历史、词典自定义顺序。逻辑从 search-page 中拆出,便于维护与复用。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLookup, fetchSuggest } from "./api";
import {
  HISTORY_MAX,
  DictEntry,
  LookupItem,
  MDD_EXT_RE,
  MDX_EXT_RE,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_LIMIT,
} from "./shared";

const HISTORY_KEY = "mdict-history";
const ORDER_KEY = "mdict-dict-order";

function loadList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function saveList<T>(key: string, v: T[]): void {
  localStorage.setItem(key, JSON.stringify(v));
}

// ---- 查询历史 ----

export function useHistory() {
  // 初始为空,挂载后从 localStorage 加载:SSR 时 localStorage 不存在,
  // 若在 useState 初始值里读取会导致服务端与客户端首帧 HTML 不一致
  // (hydration mismatch)。
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadList<string>(HISTORY_KEY));
  }, []);

  /** 记录一次查询(去重 + 上限),同步持久化。 */
  const record = useCallback((w: string) => {
    setHistory((prev) => {
      const next = [w, ...prev.filter((x) => x !== w)].slice(0, HISTORY_MAX);
      saveList(HISTORY_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((w: string) => {
    setHistory((prev) => {
      const next = prev.filter((x) => x !== w);
      saveList(HISTORY_KEY, next);
      return next;
    });
  }, []);

  return { history, record, remove };
}

// ---- 查询:URL 同步 + 请求竞态保护 ----

export function useLookup(record: (w: string) => void) {
  const [results, setResults] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  // 最近一次实际发起查询的词:用于区分"输入中"与"已查询"(miss 判定)
  const [lastWord, setLastWord] = useState("");
  // 请求序号:只接受最后一次查询的响应,慢的过期响应直接丢弃
  const seq = useRef(0);

  const lookup = useCallback(
    (word: string) => {
      const w = word.trim();
      if (!w) return;
      setLastWord(w);
      // 同步 URL(?q=词):浏览器后退/前进可在不同查询间切换
      const cur = new URL(window.location.href).searchParams.get("q") ?? "";
      if (cur === w) {
        window.history.replaceState(null, "", `?q=${encodeURIComponent(w)}`);
      } else {
        window.history.pushState(null, "", `?q=${encodeURIComponent(w)}`);
      }
      const id = ++seq.current;
      setLoading(true);
      fetchLookup(w)
        .then((j) => {
          if (id !== seq.current) return;
          setResults(j.results);
          record(w);
        })
        .catch(() => {
          if (id === seq.current) setResults([]);
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    },
    [record],
  );

  const clear = useCallback(() => {
    seq.current += 1; // 使在途查询响应作废,避免覆盖清空后的结果
    setLoading(false); // 在途响应的 finally 已被序号守卫跳过,这里负责复位
    setResults([]);
    setLastWord(""); // 未查询任何词时不应显示 miss
  }, []);
  return { results, loading, lookup, clear, lastWord };
}

// ---- 输入联想:防抖 + 过期请求取消 ----

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSug, setActiveSug] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  /** 输入变化时调用(已由调用方 setQuery);内部防抖并取消过期请求。 */
  const trigger = useCallback(
    (v: string) => {
      setActiveSug(-1);
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
      if (v.trim().length === 0) {
        setSuggestions([]);
        return;
      }
      timer.current = setTimeout(() => {
        const ctrl = new AbortController();
        abort.current = ctrl;
        // dict=-1:服务端聚合全部词典,避免单本词典无匹配导致下拉为空
        fetchSuggest(-1, v.trim(), SUGGEST_LIMIT, ctrl.signal)
          .then((j) => {
            if (!ctrl.signal.aborted) {
              // Set 去重防御词典含重复 key
              setSuggestions([...new Set(j.suggestions)]);
            }
          })
          .catch(() => {
            if (!ctrl.signal.aborted) setSuggestions([]);
          });
      }, SUGGEST_DEBOUNCE_MS);
    },
    [],
  );

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    setSuggestions([]);
  }, []);
  return { suggestions, activeSug, setActiveSug, trigger, hide };
}

// ---- 词典自定义顺序(持久化),驱动弹窗列表与结果卡排列 ----

export function useDictOrder(dicts: DictEntry[]) {
  // 初始为空,挂载后加载持久化顺序(原因同 useHistory:SSR 无 localStorage)
  const [dictOrder, setDictOrder] = useState<string[]>([]);

  useEffect(() => {
    setDictOrder(loadList<string>(ORDER_KEY));
  }, []);
  const persist = useCallback((names: string[]) => {
    saveList(ORDER_KEY, names);
    setDictOrder(names);
  }, []);

  const orderIdx = useMemo(
    () => new Map(dictOrder.map((n, i) => [n.toLowerCase(), i])),
    [dictOrder],
  );
  const nameOf = useCallback(
    (id: number) => dicts.find((d) => d.id === id)?.name ?? "",
    [dicts],
  );

  /** 词典行(MDX + 配套 MDD,按自定义顺序;未在顺序中的保持原始次序)。 */
  const rows = useMemo(() => {
    const mddOf = new Map<string, DictEntry>();
    for (const d of dicts) {
      if (MDD_EXT_RE.test(d.name)) {
        mddOf.set(d.name.replace(MDD_EXT_RE, "").toLowerCase(), d);
      }
    }
    const base = dicts
      .filter((d) => !MDD_EXT_RE.test(d.name))
      .map((mdx) => ({
        mdx,
        mdd: mddOf.get(mdx.name.replace(MDX_EXT_RE, "").toLowerCase()),
      }));
    return [...base].sort((a, b) => {
      const ia = orderIdx.get(a.mdx.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const ib = orderIdx.get(b.mdx.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }, [dicts, orderIdx]);

  /** 上移/下移(以当前完整顺序为基准交换相邻项)。 */
  const moveDict = useCallback(
    (name: string, dir: -1 | 1) => {
      const current = rows.map((r) => r.mdx.name);
      const pos = current.findIndex((n) => n.toLowerCase() === name.toLowerCase());
      const target = pos + dir;
      if (pos < 0 || target < 0 || target >= current.length) return;
      [current[pos], current[target]] = [current[target], current[pos]];
      persist(current);
    },
    [rows, persist],
  );

  /** 拖动排序:把 from 索引的行移动到 to 索引。 */
  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const current = rows.map((r) => r.mdx.name);
      const [item] = current.splice(from, 1);
      current.splice(to, 0, item);
      persist(current);
    },
    [rows, persist],
  );

  /** 置顶 / 置于底部。 */
  const moveToEdge = useCallback(
    (name: string, to: "top" | "bottom") => {
      const current = rows.map((r) => r.mdx.name);
      const pos = current.findIndex((n) => n.toLowerCase() === name.toLowerCase());
      if (pos < 0) return;
      const [item] = current.splice(pos, 1);
      if (to === "top") current.unshift(item);
      else current.push(item);
      persist(current);
    },
    [rows, persist],
  );

  return { orderIdx, rows, nameOf, moveDict, reorder, moveToEdge };
}
