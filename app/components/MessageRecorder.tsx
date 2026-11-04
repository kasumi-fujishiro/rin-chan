"use client";

import { useEffect, useRef, useState } from "react";
import { deleteMessage, listMessages, putMessage, type Message } from "../lib/familyStore";

const MAX_SECONDS = 30;

// iPad の Safari は audio/mp4、ほかのブラウザは audio/webm で録れる
function pickMimeType() {
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

const card = "flex flex-col gap-4 rounded-3xl bg-white p-6 shadow";

export function MessageRecorder({ defaultFrom }: { defaultFrom: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [from, setFrom] = useState(defaultFrom);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listMessages().then(setMessages);
  }, []);
  useEffect(() => {
    // 呼び方が保存されたら、まだ入力していなければそれを使う
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom((f) => f || defaultFrom);
  }, [defaultFrom]);

  const start = async () => {
    setError("");
    setDraft(null);
    try {
      // 周りの雑音を抑えて録る(試用で、伝言に雑音が入って聞き取りづらかったため)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        // マイクを手放す(話す画面の聞き取りとマイクを取り合わないように)
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        setDraft(new Blob(chunks, { type: recorder.mimeType || mimeType }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("マイクが使えませんでした。Safari の設定で、このサイトのマイクを「許可」にしてください。");
    }
  };

  const stop = () => recorderRef.current?.state === "recording" && recorderRef.current.stop();

  const save = async () => {
    if (!draft || !from.trim()) return;
    await putMessage({
      id: crypto.randomUUID(),
      from: from.trim(),
      audio: draft,
      text: text.trim() || undefined,
      createdAt: Date.now(),
    });
    setText("");
    setDraft(null);
    setMessages(await listMessages());
  };

  return (
    <section className={card}>
      <h2 className="text-2xl font-bold">家族からの伝言(声)</h2>
      <p className="text-lg text-zinc-600">
        ご家族の声で、短い伝言を録音できます(30秒まで)。話す画面に「〇〇から伝言があります」と出て、ご本人が押すと流れます。リンちゃんが家族の声で話すことはありません。
      </p>
      <label className="flex flex-col gap-1 text-lg">
        誰から(ご本人から見た呼び方)
        <input
          className="w-full rounded-xl border-2 p-3 text-xl"
          value={from}
          placeholder="例:お母さん"
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        字幕(伝言の言葉。キーボードのマイクを押して話すと文字になります)
        <textarea
          className="w-full rounded-xl border-2 p-3 text-xl"
          rows={2}
          value={text}
          placeholder="例:お母さんだよ。夕方に行くからね。"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        {recording ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-2xl bg-rose-500 px-6 py-4 text-2xl text-white"
          >
            ■ 止める({MAX_SECONDS - seconds}秒)
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="rounded-2xl bg-amber-600 px-6 py-4 text-2xl text-white"
          >
            ● {draft ? "録り直す" : "録音する"}
          </button>
        )}
        {draft && !recording && <AudioPlayer blob={draft} />}
      </div>
      {draft && !recording && (
        <button
          type="button"
          onClick={save}
          disabled={!from.trim()}
          className="rounded-2xl bg-amber-600 py-4 text-2xl text-white disabled:opacity-40"
        >
          この伝言を残す
        </button>
      )}
      {error && <p className="text-xl text-rose-700">{error}</p>}

      <ul className="grid gap-3">
        {messages.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-3 text-lg">
            <span className="font-bold">{m.from}</span>
            <span className="text-zinc-500">{new Date(m.createdAt).toLocaleString("ja-JP")}</span>
            <span className={m.heardAt ? "text-emerald-700" : "text-zinc-500"}>
              {m.heardAt
                ? `聞きました(${new Date(m.heardAt).toLocaleString("ja-JP")})`
                : "まだ聞いていません"}
            </span>
            <AudioPlayer blob={m.audio} />
            {m.text && <span className="w-full text-zinc-700">字幕:{m.text}</span>}
            {m.reply && <span className="w-full font-bold text-sky-800">ご本人の返事:{m.reply}</span>}
            {m.doneAt && !m.reply && <span className="w-full text-zinc-500">「わかった」を押しました</span>}
            <button
              type="button"
              className="ml-auto rounded-xl bg-zinc-200 px-4 py-2"
              onClick={async () => {
                if (!confirm(`${m.from}からの伝言を消します。よろしいですか?`)) return;
                await deleteMessage(m.id);
                setMessages(await listMessages());
              }}
            >
              消す
            </button>
          </li>
        ))}
        {messages.length === 0 && <p className="text-lg text-zinc-500">まだありません</p>}
      </ul>
    </section>
  );
}

function AudioPlayer({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <audio src={url} controls className="h-12" /> : null;
}
