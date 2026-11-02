"use client";

import { useEffect, useState } from "react";
import { clearTrialLog, readTrialLog, type TrialEntry } from "../lib/trialLog";

const REASK_LABEL = ["", "聞き返し1回目", "聞き返し2回目", "聞き返し3回目(終了)"];

export function TrialLogView() {
  const [log, setLog] = useState<TrialEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // localStorage はブラウザでしか読めないので、描画後に読む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog(readTrialLog());
  }, []);

  const asText = () =>
    log
      .map((e) => {
        const at = new Date(e.at).toLocaleString("ja-JP");
        return `${at}${e.reask ? `【${REASK_LABEL[e.reask]}】` : ""}\n本人:${e.heard}\nリンちゃん:${e.reply}`;
      })
      .join("\n\n");

  const reaskCount = log.filter((e) => e.reask > 0).length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-bold">試用の記録(この iPad の中だけ)</h1>
      <p className="text-xl">
        会話 {log.length} 回 / そのうち聞き返し {reaskCount} 回
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(asText());
            setCopied(true);
          }}
          className="rounded-2xl bg-amber-600 px-5 py-4 text-xl text-white"
        >
          {copied ? "コピーしました" : "全部コピー"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("記録を全部消します。よろしいですか?")) {
              clearTrialLog();
              setLog([]);
            }
          }}
          className="rounded-2xl bg-zinc-200 px-5 py-4 text-xl"
        >
          記録を消す
        </button>
      </div>
      <ul className="grid gap-4">
        {[...log].reverse().map((e, i) => (
          <li key={i} className="rounded-2xl bg-white p-4 text-lg shadow">
            <p className="text-zinc-500">
              {new Date(e.at).toLocaleString("ja-JP")}
              {e.reask > 0 && <span className="ml-2 font-bold text-rose-700">{REASK_LABEL[e.reask]}</span>}
            </p>
            <p>本人:{e.heard}</p>
            <p>リンちゃん:{e.reply}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
