"use client";

import Link from "next/link";
import { ReportPanel } from "./ReportPanel";
import { useEffect, useState } from "react";
import {
  addTrialMemo,
  clearTrialLog,
  markTrialEntry,
  readTrialLog,
  readTrialMemos,
  type TrialEntry,
  type TrialMemo,
} from "../lib/trialLog";

const REASK_LABEL = ["", "聞き返し1回目", "聞き返し2回目", "聞き返し3回目(終了)"];

const pickText = (p: NonNullable<TrialEntry["pick"]>) =>
  `${p.kind}/候補 ${p.candidates.join("・") || "なし"} → ${p.chosen ? `「${p.chosen}」を選んだ` : "選ばなかった"}`;

const time = (at: string) => new Date(at).toLocaleString("ja-JP");

type Row = { type: "talk"; entry: TrialEntry } | { type: "memo"; memo: TrialMemo };

export function TrialLogView() {
  const [log, setLog] = useState<TrialEntry[]>([]);
  const [memos, setMemos] = useState<TrialMemo[]>([]);
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // localStorage はブラウザでしか読めないので、描画後に読む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog(readTrialLog());
    setMemos(readTrialMemos());
  }, []);

  // 会話とメモを時刻順に並べる(新しいものが上)
  const rows: Row[] = [
    ...log.map((entry) => ({ type: "talk" as const, entry })),
    ...memos.map((m) => ({ type: "memo" as const, memo: m })),
  ].sort((a, b) =>
    (a.type === "talk" ? a.entry.at : a.memo.at) < (b.type === "talk" ? b.entry.at : b.memo.at) ? 1 : -1,
  );

  const asText = () =>
    [...rows]
      .reverse()
      .map((r) => {
        if (r.type === "memo") return `${time(r.memo.at)}【家族のメモ】\n${r.memo.text}`;
        const e = r.entry;
        const tags = [
          e.reask ? `【${REASK_LABEL[e.reask]}】` : "",
          e.pick ? `【写真で選ぶ:${pickText(e.pick)}】` : "",
          e.prompt ? `【リンちゃんから:${e.prompt}】` : "",
          e.reactionTo ? `【${e.reactionTo}への反応】` : "",
          e.understood === true ? "【伝わった】" : e.understood === false ? "【伝わらなかった】" : "",
        ].join("");
        return `${time(e.at)}${tags}\n本人:${e.heard}\nリンちゃん:${e.reply}`;
      })
      .join("\n\n");

  const talks = log.filter((e) => !e.pick && !e.prompt);
  const picks = log.filter((e) => e.pick);
  const picked = picks.filter((e) => e.pick?.chosen).length;
  const reaskCount = talks.filter((e) => e.reask > 0).length;
  const ok = talks.filter((e) => e.understood === true);
  const ng = talks.filter((e) => e.understood === false).length;
  // どの言い直しで伝わったか(0 は言い直しなし)
  const okByStage = [0, 1, 2, 3].map((s) => ok.filter((e) => e.reask === s).length);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">試用の記録(この iPad の中だけ)</h1>
        <nav className="flex gap-4 text-lg underline">
          <Link href="/">話す画面</Link>
          <Link href="/family">家族の登録</Link>
        </nav>
      </header>

      <div className="grid gap-1 rounded-2xl bg-white p-4 text-xl shadow">
        <p>
          会話 {talks.length} 回 / そのうち聞き返し {reaskCount} 回 / 写真で選ぶ {picks.length} 回(選べた{" "}
          {picked} 回)
        </p>
        <p>
          伝わった {ok.length} 回(言い直しなし {okByStage[0]}・1回目 {okByStage[1]}・2回目 {okByStage[2]}) /
          伝わらなかった {ng} 回
        </p>
      </div>

      <ReportPanel log={log} memos={memos} />

      <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4">
        <label htmlFor="memo" className="text-xl font-bold">
          気づいたことのメモ
        </label>
        <textarea
          id="memo"
          rows={3}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例:写真を見たら笑顔になった。2回目の言い直しで「ああ」とうなずいた"
          className="w-full rounded-xl border-2 p-3 text-xl"
        />
        <button
          type="button"
          disabled={!memo.trim()}
          onClick={() => {
            setMemos(addTrialMemo(memo.trim()));
            setMemo("");
          }}
          className="self-start rounded-2xl bg-amber-600 px-5 py-3 text-xl text-white disabled:opacity-40"
        >
          メモを残す
        </button>
      </div>

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
            if (confirm("記録とメモを全部消します。よろしいですか?")) {
              clearTrialLog();
              setLog([]);
              setMemos([]);
            }
          }}
          className="rounded-2xl bg-zinc-200 px-5 py-4 text-xl"
        >
          記録を消す
        </button>
      </div>

      <ul className="grid gap-4">
        {rows.map((r) =>
          r.type === "memo" ? (
            <li key={`m-${r.memo.at}`} className="rounded-2xl bg-amber-100 p-4 text-lg shadow">
              <p className="text-zinc-500">{time(r.memo.at)} 家族のメモ</p>
              <p className="whitespace-pre-wrap">{r.memo.text}</p>
            </li>
          ) : (
            <li key={`t-${r.entry.at}`} className="rounded-2xl bg-white p-4 text-lg shadow">
              <p className="text-zinc-500">
                {time(r.entry.at)}
                {r.entry.reask > 0 && (
                  <span className="ml-2 font-bold text-rose-700">{REASK_LABEL[r.entry.reask]}</span>
                )}
                {r.entry.pick && (
                  <span className="ml-2 font-bold text-emerald-700">写真で選ぶ:{pickText(r.entry.pick)}</span>
                )}
                {r.entry.prompt && (
                  <span className="ml-2 font-bold text-sky-700">リンちゃんから:{r.entry.prompt}</span>
                )}
                {r.entry.reactionTo && (
                  <span className="ml-2 font-bold text-sky-700">{r.entry.reactionTo}への反応</span>
                )}
              </p>
              <p>本人:{r.entry.heard}</p>
              <p>リンちゃん:{r.entry.reply}</p>
              {!r.entry.pick && !r.entry.prompt && (
                <div className="mt-2 flex gap-2">
                  {([true, false] as const).map((value) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setLog(markTrialEntry(r.entry.at, value))}
                      className={`rounded-xl px-4 py-2 text-lg ${
                        r.entry.understood === value
                          ? value
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                          : "bg-zinc-100"
                      }`}
                    >
                      {value ? "伝わった" : "伝わらなかった"}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </main>
  );
}
