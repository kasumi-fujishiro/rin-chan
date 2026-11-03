"use client";

import { useState } from "react";
import { toProfile, type Entry, type Settings } from "../lib/familyStore";
import { readTrialLog } from "../lib/trialLog";
import type { Word } from "../lib/types";

type Suggestion = { type: "言い方" | "取り違え"; say: string; means: string; reason: string };

// 会話の記録から「言葉の辞書」の候補を作る。足すかどうかは家族が決める
export function DictionarySuggestions({
  settings,
  entries,
  onAdd,
}: {
  settings: Settings;
  entries: Entry[];
  onAdd: (word: Word) => Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const build = async () => {
    const records = readTrialLog();
    if (records.length === 0) {
      setMessage("まだ会話の記録がありません。話す画面で何回か話したあとに試してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, profile: toProfile(settings, entries) }),
      });
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(data.suggestions);
      if (data.suggestions.length === 0) setMessage("新しい候補は見つかりませんでした。");
    } catch {
      setMessage("うまくつながりませんでした。もう一度試してください。");
    } finally {
      setBusy(false);
    }
  };

  const remove = (s: Suggestion) => setSuggestions((list) => list?.filter((x) => x !== s) ?? null);

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow">
      <h2 className="text-2xl font-bold">言葉の辞書の候補</h2>
      <p className="text-lg text-zinc-600">
        試用の記録(言った言葉と、写真で選んだもの)から、辞書に足すとよさそうな言い方を Claude
        が探します。記録の文字の部分だけを送り、保存はしません。足すかどうかは、ご家族が決めてください。
      </p>
      <button
        type="button"
        onClick={build}
        disabled={busy}
        className="rounded-2xl bg-amber-600 py-4 text-2xl text-white disabled:opacity-40"
      >
        {busy ? "記録を読んでいます…" : "記録から候補を作る"}
      </button>
      {message && <p className="text-lg">{message}</p>}
      <ul className="grid gap-3">
        {suggestions?.map((s) => (
          <li
            key={`${s.type}-${s.say}`}
            className={`flex flex-col gap-2 rounded-2xl p-4 ${s.type === "言い方" ? "bg-amber-50" : "bg-rose-50"}`}
          >
            <p className="text-xl">
              <span className="mr-2 rounded-lg bg-white px-2 py-1 text-base">
                {s.type === "言い方" ? "言い方" : "気になること"}
              </span>
              {s.type === "言い方" ? (
                <>
                  「<b>{s.say}</b>」は「<b>{s.means}</b>」のこと
                </>
              ) : (
                <>
                  「<b>{s.means}</b>」のときに「<b>{s.say}</b>」と言ったかもしれません
                </>
              )}
            </p>
            <p className="text-lg text-zinc-600">{s.reason}</p>
            <div className="flex gap-3">
              {/* 取り違えは辞書に入れない(入れると、いつも入れ替えて受け取ってしまう) */}
              {s.type === "言い方" && (
                <button
                  type="button"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-lg text-white"
                  onClick={async () => {
                    await onAdd({ say: s.say, means: s.means });
                    remove(s);
                  }}
                >
                  辞書に足す
                </button>
              )}
              <button type="button" className="rounded-xl bg-zinc-200 px-4 py-2 text-lg" onClick={() => remove(s)}>
                {s.type === "言い方" ? "足さない" : "わかった"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
