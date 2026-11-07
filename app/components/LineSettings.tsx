"use client";

import { useEffect, useState } from "react";
import { listMessages, putMessage, type LineSender, type Settings } from "../lib/familyStore";
import { DEFAULT_REPORT_TIME } from "../lib/report";

type Status = { lineReady: boolean; keyConfigured: boolean } | null;

// LINE への送信の設定。合言葉は Cloudflare に登録したものと同じものを入れる
export function LineSettings({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (patch: Partial<Pick<Settings, "lineKey" | "notifyReplies" | "lineSenders" | "autoReport">>) => Promise<void>;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [key, setKey] = useState(settings.lineKey ?? "");
  const [notify, setNotify] = useState(settings.notifyReplies ?? true);
  const [message, setMessage] = useState("");
  const [autoOn, setAutoOn] = useState(settings.autoReport?.enabled ?? false);
  const [autoTime, setAutoTime] = useState(settings.autoReport?.time ?? DEFAULT_REPORT_TIME);
  const autoReport = { enabled: autoOn, time: autoTime || DEFAULT_REPORT_TIME };
  const [senders, setSenders] = useState<LineSender[]>(settings.lineSenders ?? []);

  // 呼び名を決めたら、まだ終わっていない伝言の「誰から」も直す
  const saveSenders = async () => {
    const cleaned = senders.map((s) => ({ ...s, callName: s.callName.trim() }));
    await onSave({ lineSenders: cleaned });
    for (const m of await listMessages()) {
      const s = cleaned.find((x) => x.userId === m.lineUserId);
      if (s?.callName && !m.doneAt && m.from !== s.callName) await putMessage({ ...m, from: s.callName });
    }
    setMessage("呼び名を保存しました");
  };

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ lineReady: false, keyConfigured: false }));
  }, []);

  const test = async () => {
    await onSave({ lineKey: key.trim(), notifyReplies: notify, autoReport });
    setMessage("送っています…");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rin-key": key.trim() },
        body: JSON.stringify({
          action: "send",
          text: "リンちゃんからのテストです。この iPad から LINE に送れるようになりました。",
        }),
      });
      const data = (await res.json()) as { sent: boolean; reason?: string };
      setMessage(
        data.sent ? "送りました。LINE に届いたか確かめてください" : (data.reason ?? "送れませんでした"),
      );
    } catch {
      setMessage("送れませんでした");
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow">
      <h2 className="text-2xl font-bold">LINE への連絡</h2>
      <p className="text-lg text-zinc-600">
        報告と伝言の返事を、「リンちゃん」の LINE
        公式アカウントを友だち追加した家族に送ります。送るには、Cloudflare に登録した合言葉を、この iPad
        にも入れてください(この iPad の中にだけ保存します)。
      </p>
      {status && (
        <p className="text-lg">
          {status.lineReady ? "○ LINE の設定はできています" : "✕ LINE の設定がまだです"}
          <br />
          {status.keyConfigured
            ? "○ 合言葉は登録されています"
            : "✕ 合言葉がまだ登録されていません(README の手順)"}
        </p>
      )}
      <label className="flex flex-col gap-1 text-lg">
        合言葉
        <input
          type="password"
          autoComplete="off"
          className="w-full rounded-xl border-2 p-3 text-xl"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-3 text-lg">
        <input
          type="checkbox"
          className="h-7 w-7"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        伝言にご本人が返事をしたら、その場で LINE に知らせる
      </label>
      <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-3">
        <label className="flex flex-wrap items-center gap-3 text-lg">
          <input type="checkbox" className="h-7 w-7" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
          毎日
          <input
            type="time"
            className="rounded-xl border-2 p-2 text-xl"
            value={autoTime}
            onChange={(e) => setAutoTime(e.target.value)}
          />
          に、今日の報告を自動で LINE に送る
        </label>
        <p className="text-base text-zinc-600">
          ご家族が読んで直す前に、そのまま送ります。送るのはこの iPad なので、その時間に話す画面を開いたままにしてください(閉じていたら、その日のうちに開いたときに送ります)。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            await onSave({ lineKey: key.trim(), notifyReplies: notify, autoReport });
            setMessage("保存しました");
          }}
          className="rounded-2xl bg-amber-600 px-6 py-4 text-xl text-white"
        >
          保存
        </button>
        <button
          type="button"
          onClick={test}
          disabled={!key.trim()}
          className="rounded-2xl bg-zinc-200 px-6 py-4 text-xl disabled:opacity-40"
        >
          保存して、試しに送る
        </button>
      </div>
      <h3 className="mt-2 text-xl font-bold">LINE から伝言を送る</h3>
      <p className="text-lg text-zinc-600">
        公式アカウントに声(ボイスメッセージ)か文字を送ると、この iPad に伝言として届きます(1分ごとに取りに行きます)。届くまでの間だけサーバーに置き、受け取ったらすぐ消します。受け取られなくても3日で消えます。
      </p>
      {senders.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-lg">送ってくれた人を、ご本人が分かる呼び方にしてください(例:お母さん)。</p>
          {senders.map((s, i) => (
            <label key={s.userId} className="flex flex-wrap items-center gap-3 text-lg">
              <span className="min-w-32 text-zinc-600">LINE:{s.lineName || "(名前なし)"}</span>
              <input
                className="rounded-xl border-2 p-2 text-xl"
                placeholder="呼び方"
                value={s.callName}
                onChange={(e) =>
                  setSenders((list) => list.map((x, j) => (j === i ? { ...x, callName: e.target.value } : x)))
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={saveSenders}
            className="self-start rounded-2xl bg-amber-600 px-6 py-3 text-xl text-white"
          >
            呼び方を保存
          </button>
        </div>
      )}
      {message && <p className="text-lg">{message}</p>}
    </section>
  );
}
