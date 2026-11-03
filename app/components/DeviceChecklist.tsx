"use client";

import { useEffect, useRef, useState } from "react";

type Status = "未" | "○" | "✕";

// 試用の前に、iPad の実機で動くかを1つずつ確かめる
export function DeviceChecklist({ heard }: { heard: boolean }) {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const audioUrl = useRef<string | null>(null);

  const set = (key: string, s: Status, note = "") => {
    setStatus((x) => ({ ...x, [key]: s }));
    setNotes((x) => ({ ...x, [key]: note }));
  };

  // 開いたときに自動で分かるもの
  useEffect(() => {
    (async () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const standalone = nav.standalone === true || matchMedia("(display-mode: standalone)").matches;
      set(
        "safari",
        standalone ? "✕" : "○",
        standalone ? "ホーム画面から開いています。Safari で開き直してください" : "Safari で開いています",
      );

      try {
        const file = new File(["test"], "test.json", { type: "application/json" });
        const ok = !!navigator.canShare?.({ files: [file] });
        set(
          "share",
          ok ? "○" : "✕",
          ok ? "バックアップを共有シートで渡せます" : "共有シートが使えないので、ダウンロードで保存します",
        );
      } catch {
        set("share", "✕", "共有シートが使えないので、ダウンロードで保存します");
      }

      try {
        const persisted = (await navigator.storage?.persist?.()) ?? false;
        const est = await navigator.storage?.estimate?.();
        const free =
          est?.quota && est.usage !== undefined ? Math.round((est.quota - est.usage) / 1024 / 1024) : null;
        set(
          "storage",
          free === null || free > 50 ? "○" : "✕",
          `${persisted ? "消さないよう設定できました" : "7日ほど使わないと消えることがあります(毎日使えば大丈夫)"}${free !== null ? `。空き約 ${free}MB` : ""}`,
        );
      } catch {
        set("storage", "✕", "保存場所を確かめられませんでした");
      }
    })();
    return () => {
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);

  const testSpeak = () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("リンちゃんです。聞こえますか。");
    u.lang = "ja-JP";
    u.rate = 0.8;
    speechSynthesis.speak(u);
    set("speak", "未", "聞こえたら「聞こえた」を押してください");
  };

  const testRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || type });
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl.current);
        audio.onended = () => set("record", "未", "自分の声が聞こえたら「聞こえた」を押してください");
        audio.onerror = () => set("record", "✕", "録った声を再生できませんでした");
        void audio.play().catch(() => set("record", "✕", "録った声を再生できませんでした"));
      };
      setRecording(true);
      set("record", "未", "3秒録音しています。何か話してください");
      rec.start();
      setTimeout(() => rec.state === "recording" && rec.stop(), 3000);
    } catch {
      set("record", "✕", "マイクが使えませんでした。Safari の設定でマイクを許可してください");
    }
  };

  const rows: { key: string; label: string; action?: React.ReactNode }[] = [
    { key: "safari", label: "Safari で開いている" },
    {
      key: "speak",
      label: "読み上げが聞こえる",
      action: (
        <>
          <Btn onClick={testSpeak}>鳴らす</Btn>
          <Btn onClick={() => set("speak", "○", "")}>聞こえた</Btn>
        </>
      ),
    },
    { key: "listen", label: "声の聞き取り(上の「はなす」で試してください)" },
    {
      key: "record",
      label: "伝言の録音と再生",
      action: (
        <>
          <Btn onClick={testRecord} disabled={recording}>
            {recording ? "録音中…" : "3秒録って再生"}
          </Btn>
          <Btn onClick={() => set("record", "○", "")}>聞こえた</Btn>
        </>
      ),
    },
    {
      key: "camera",
      label: "カメラで写真を撮れる",
      action: (
        <label className="cursor-pointer rounded-xl bg-amber-100 px-4 py-2">
          撮ってみる
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (photo) URL.revokeObjectURL(photo);
              setPhoto(URL.createObjectURL(f));
              set("camera", "○", "");
            }}
          />
        </label>
      ),
    },
    { key: "share", label: "バックアップを共有シートで渡せる" },
    { key: "storage", label: "データを iPad の中に残せる" },
  ];

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-6 shadow">
      <h2 className="text-2xl font-bold">試用の前のチェック</h2>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const s = r.key === "listen" && heard ? "○" : (status[r.key] ?? "未");
          return (
            <li key={r.key} className="flex flex-wrap items-center gap-3 text-xl">
              <span
                className={`w-8 text-center ${s === "○" ? "text-emerald-600" : s === "✕" ? "text-rose-600" : "text-zinc-400"}`}
              >
                {s === "未" ? "・" : s}
              </span>
              <span className="flex-1">
                {r.label}
                {notes[r.key] && <span className="block text-base text-zinc-500">{notes[r.key]}</span>}
              </span>
              {r.action && <span className="flex gap-2 text-lg">{r.action}</span>}
            </li>
          );
        })}
      </ul>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" className="h-32 w-32 rounded-xl object-cover" />}
    </section>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className="rounded-xl bg-amber-100 px-4 py-2 disabled:opacity-40" />
  );
}
