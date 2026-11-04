"use client";

import { useEffect, useState } from "react";
import type { Settings } from "../lib/familyStore";

type Status = { lineReady: boolean; keyConfigured: boolean } | null;

// LINE への送信の設定。合言葉は Cloudflare に登録したものと同じものを入れる
export function LineSettings({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (patch: Pick<Settings, "lineKey" | "notifyReplies">) => Promise<void>;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [key, setKey] = useState(settings.lineKey ?? "");
  const [notify, setNotify] = useState(settings.notifyReplies ?? true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ lineReady: false, keyConfigured: false }));
  }, []);

  const test = async () => {
    await onSave({ lineKey: key.trim(), notifyReplies: notify });
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
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            await onSave({ lineKey: key.trim(), notifyReplies: notify });
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
      {message && <p className="text-lg">{message}</p>}
    </section>
  );
}
