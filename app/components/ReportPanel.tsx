"use client";

import { useEffect, useState } from "react";
import { getSettings, listEntries, toProfile } from "../lib/familyStore";
import type { TrialEntry, TrialMemo } from "../lib/trialLog";

const isToday = (at: string) => new Date(at).toDateString() === new Date().toDateString();

// 今日の記録を Claude が報告文にまとめ、家族が確認してから LINE に送る
export function ReportPanel({ log, memos }: { log: TrialEntry[]; memos: TrialMemo[] }) {
  const [lineReady, setLineReady] = useState<boolean | null>(null);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then((d: { lineReady: boolean }) => setLineReady(d.lineReady))
      .catch(() => setLineReady(false));
  }, []);

  const draft = async () => {
    const records = log.filter((e) => isToday(e.at));
    const todaysMemos = memos.filter((m) => isToday(m.at));
    if (records.length === 0 && todaysMemos.length === 0) {
      setMessage("今日の記録がまだありません。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const [settings, entries] = await Promise.all([getSettings(), listEntries()]);
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          records,
          memos: todaysMemos,
          profile: toProfile(settings, entries),
        }),
      });
      const data = (await res.json()) as { report: string };
      setReport(data.report);
      if (!data.report) setMessage("報告を作れませんでした。もう一度試してください。");
    } catch {
      setMessage("うまくつながりませんでした。もう一度試してください。");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!confirm("この報告を LINE に送ります。よろしいですか?")) return;
    setBusy(true);
    try {
      // 合言葉は家族の登録画面で入れたもの
      const lineKey = (await getSettings())?.lineKey ?? "";
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rin-key": lineKey },
        body: JSON.stringify({ action: "send", text: report }),
      });
      const data = (await res.json()) as { sent: boolean; reason?: string };
      setMessage(data.sent ? "LINE に送りました" : (data.reason ?? "送れませんでした"));
    } catch {
      setMessage("送れませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow">
      <h2 className="text-xl font-bold">家族への報告</h2>
      <p className="text-lg text-zinc-600">
        今日の記録とメモから、Claude
        が報告をまとめます。ご本人の話と、記録で確かめられたことは分けて書きます。送る前に読んで、直してください。
      </p>
      <button
        type="button"
        onClick={draft}
        disabled={busy}
        className="self-start rounded-2xl bg-amber-600 px-5 py-3 text-xl text-white disabled:opacity-40"
      >
        {busy && !report ? "まとめています…" : "今日の報告を作る"}
      </button>
      {report && (
        <>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={14}
            className="w-full rounded-xl border-2 p-3 text-lg"
          />
          <div className="flex flex-wrap gap-3">
            {lineReady ? (
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-xl text-white disabled:opacity-40"
              >
                LINE に送る
              </button>
            ) : (
              <p className="text-lg text-zinc-600">
                LINE の設定がまだなので、送るボタンは出ていません。下の「コピー」で、LINE
                に貼り付けて送れます。
              </p>
            )}
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(report);
                setMessage("コピーしました");
              }}
              className="rounded-2xl bg-zinc-200 px-5 py-3 text-xl"
            >
              コピー
            </button>
          </div>
        </>
      )}
      {message && <p className="text-lg">{message}</p>}
    </section>
  );
}
