"use client";

// 未命中提示 + 拼写近似(编辑距离 ≤ LEVENSHTEIN_MAX 的联想候选)。
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchSuggest } from "@/lib/api";
import { LEVENSHTEIN_MAX, SUGGEST_LIMIT_MISS } from "@/lib/shared";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}

export default function MissPanel({
  word,
  onLookup,
}: {
  word: string;
  onLookup: (w: string) => void;
}) {
  const [hint, setHint] = useState<string[] | null>(null);

  useEffect(() => {
    let live = true;
    fetchSuggest(-1, word, SUGGEST_LIMIT_MISS)
      .catch(() => ({ suggestions: [] as string[] }))
      .then((j: { suggestions: string[] }) => {
        if (!live) return;
        const cand = [...new Set(j.suggestions)]
          .map((s) => ({ s, d: levenshtein(word.toLowerCase(), s.toLowerCase()) }))
          .filter((x) => x.d > 0 && x.d <= LEVENSHTEIN_MAX)
          .sort((a, b) => a.d - b.d)
          .slice(0, 6)
          .map((x) => x.s);
        setHint(cand);
      });
    return () => {
      live = false;
    };
  }, [word]);

  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      未找到 “{word}”。
      {hint && hint.length > 0 && (
        <>
          {" "}
          你是不是想查:{" "}
          {hint.map((h) => (
            <Button
              key={h}
              variant="link"
              size="sm"
              className="h-auto p-0 text-amber-900 underline"
              onClick={() => onLookup(h)}
            >
              {h}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
