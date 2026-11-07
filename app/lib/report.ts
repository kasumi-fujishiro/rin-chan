"use client";

import { useEffect, useRef } from "react";
import { getSettings, listEntries, toProfile } from "./familyStore";
import { readTrialLog, readTrialMemos, type TrialEntry, type TrialMemo } from "./trialLog";

export const isToday = (at: string) => new Date(at).toDateString() === new Date().toDateString();

// 今日の記録とメモを、Claude に報告文にまとめてもらう。記録がなければ空文字
export async function draftReport(log: TrialEntry[], memos: TrialMemo[]): Promise<string> {
  const records = log.filter((e) => isToday(e.at));
  const todaysMemos = memos.filter((m) => isToday(m.at));
  if (records.length === 0 && todaysMemos.length === 0) return "";
  const [settings, entries] = await Promise.all([getSettings(), listEntries()]);
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "draft", records, memos: todaysMemos, profile: toProfile(settings, entries) }),
  });
  if (!res.ok) throw new Error("draft failed");
  return ((await res.json()) as { report: string }).report ?? "";
}

// 合言葉は家族の登録画面で入れたもの
export async function sendReport(text: string, lineKey: string): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-rin-key": lineKey },
    body: JSON.stringify({ action: "send", text }),
  });
  return (await res.json()) as { sent: boolean; reason?: string };
}

export const DEFAULT_REPORT_TIME = "21:00";
const SENT_KEY = "rin-auto-report-v1";
const MAX_TRIES = 5;

// 自動の報告の結果。家族の画面に「送りました」「送れませんでした」を出すのにも使う
export type AutoReportState = { date: string; sent: boolean; tries: number; at?: string; reason?: string };

export function readAutoReportState(): AutoReportState | null {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? "null");
  } catch {
    return null;
  }
}
function writeSent(state: AutoReportState) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(state));
  } catch {}
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

// 決まった時間に、今日の報告を自動で LINE に送る。
// 記録は iPad の中にしかないので、話す画面を開いている iPad が送る(サーバーは時間を知らない)。
// 家族の画面で設定を変えても届くように、毎分 iPad の設定を読み直す
export function useAutoReport() {
  const busy = useRef(false);
  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const settings = await getSettings();
      const auto = settings?.autoReport;
      const lineKey = settings?.lineKey;
      if (!auto?.enabled || !lineKey) return;
      const now = new Date();
      const today = now.toDateString();
      if (now.getHours() * 60 + now.getMinutes() < minutesOf(auto.time || DEFAULT_REPORT_TIME)) return;
      const state = readAutoReportState();
      const tries = state?.date === today ? state.tries : 0;
      if ((state?.date === today && state.sent) || tries >= MAX_TRIES) return;
      busy.current = true;
      const at = now.toISOString();
      writeSent({ date: today, sent: false, tries: tries + 1, at, reason: "送っています" });
      try {
        const report = await draftReport(readTrialLog(), readTrialMemos());
        const date = now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
        const text = report
          ? `【リンちゃんの今日の報告(自動)】${date}\n${report}`
          : `【リンちゃんの今日の報告(自動)】${date}\n今日は、リンちゃんとの会話の記録はありませんでした。`;
        const result = await sendReport(text, lineKey);
        writeSent({ date: today, sent: result.sent, tries: tries + 1, at, reason: result.sent ? undefined : (result.reason ?? "送れませんでした") });
      } catch {
        // 次の確認でもう一度試す(1日に MAX_TRIES 回まで)
        writeSent({ date: today, sent: false, tries: tries + 1, at, reason: "つながりませんでした" });
      } finally {
        busy.current = false;
      }
    };
    void check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);
}
