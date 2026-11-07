"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DeviceChecklist } from "./DeviceChecklist";
import { StandaloneWarning } from "./StandaloneWarning";
import { Rin, RIN_MOODS, type RinMood } from "./Rin";
import {
  detectEnv,
  speechLog,
  useJapaneseVoices,
  useRecognition,
  useSpeaker,
  type EnvInfo,
} from "../lib/speech";

const SAMPLE_LINES = [
  "こんにちは。リンちゃんです。",
  "お薬の時間ですよ。",
  "眼鏡は、テーブルの上にありますよ。",
];

type LogEntry = { at: string; heard: string };

export function VoiceCheck() {
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [manualMood, setManualMood] = useState<RinMood | null>(null);
  const [echo, setEcho] = useState(true);
  const [rate, setRate] = useState(0.8);
  const [voiceName, setVoiceName] = useState<string>("");
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setEvents([...speechLog]);
    window.addEventListener("rin-speech-log", update);
    return () => window.removeEventListener("rin-speech-log", update);
  }, []);

  const voices = useJapaneseVoices();
  const voice = voices.find((v) => v.name === voiceName) ?? voices[0];
  const speaker = useSpeaker();

  const onFinal = useCallback(
    (text: string) => {
      const at = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLog((l) => [{ at, heard: text }, ...l].slice(0, 20));
      if (echo) setPendingReply(`「${text}」と、聞こえました。`);
    },
    [echo],
  );
  const rec = useRecognition(onFinal);

  useEffect(() => {
    // 端末の情報はブラウザでしか分からないので、描画後に読む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv(detectEnv());
  }, []);

  // マイクが閉じてから返事を読み上げる(iOS では同時に使うと鳴らないことがある)
  useEffect(() => {
    if (!pendingReply || rec.listening) return;
    speaker.speak(pendingReply, { voice, rate });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingReply(null);
  }, [pendingReply, rec.listening, speaker, voice, rate]);

  const autoMood: RinMood = speaker.speaking ? "speaking" : rec.listening ? "listening" : "waiting";
  const mood = manualMood ?? autoMood;

  const onListen = () => {
    speaker.unlock();
    if (rec.listening) {
      rec.stop();
    } else {
      // start は読み上げ中(unlock の無音を含む)なら止めて少し待ってから聞き始める
      rec.start();
    }
    speaker.cancel();
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">音声の確認</h1>
        <nav className="flex gap-4 text-lg underline">
          <Link href="/">話す画面</Link>
          <Link href="/family">家族の登録</Link>
        </nav>
      </header>
      <section className="flex flex-col items-center gap-6">
        <Rin mood={mood} size={320} />
        <p className="min-h-[3em] text-center text-3xl leading-relaxed" aria-live="polite">
          {rec.listening
            ? rec.interim || "どうぞ、お話しください。"
            : rec.interim || "ボタンを押して、話しかけてください。"}
        </p>
        <button
          type="button"
          onClick={onListen}
          className={`h-28 w-full max-w-md rounded-full text-4xl font-bold text-white shadow-lg active:scale-95 ${
            rec.listening ? "bg-rose-500" : "bg-amber-600"
          }`}
        >
          {rec.listening ? "とめる" : "はなす"}
        </button>
        <StandaloneWarning />
        {rec.error && (
          <p role="alert" className="w-full rounded-2xl bg-rose-100 p-4 text-xl text-rose-900">
            {rec.error}
          </p>
        )}
        <label className="flex items-center gap-3 text-xl">
          <input
            type="checkbox"
            checked={echo}
            onChange={(e) => setEcho(e.target.checked)}
            className="h-7 w-7"
          />
          聞き取った言葉を、リンちゃんが読み返す
        </label>
      </section>

      <DeviceChecklist heard={log.length > 0} />

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-2xl font-bold">読み上げのテスト</h2>
        <div className="grid gap-3">
          {SAMPLE_LINES.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => {
                speaker.unlock();
                speaker.speak(line, { voice, rate });
              }}
              className="rounded-2xl bg-amber-100 px-5 py-4 text-left text-2xl active:bg-amber-200"
            >
              ▶ {line}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-2 text-xl">
          はやさ:{rate.toFixed(2)}(1.0 がふつう)
          <input
            type="range"
            min={0.5}
            max={1.1}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="h-10"
          />
        </label>
        <label className="flex flex-col gap-2 text-xl">
          声({voices.length} 種類)
          <select
            value={voice?.name ?? ""}
            onChange={(e) => setVoiceName(e.target.value)}
            className="rounded-xl border p-3 text-xl"
          >
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.name}>
                {v.name}
                {v.localService ? "" : "(ネット)"}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-2xl font-bold">リンちゃんの表情</h2>
        <div className="flex flex-wrap gap-3">
          <MoodButton active={manualMood === null} onClick={() => setManualMood(null)}>
            自動({RIN_MOODS.find((m) => m.mood === autoMood)?.label})
          </MoodButton>
          {RIN_MOODS.map(({ mood: m, label }) => (
            <MoodButton key={m} active={manualMood === m} onClick={() => setManualMood(m)}>
              {label}
            </MoodButton>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-2xl font-bold">この端末</h2>
        {env ? (
          <ul className="grid gap-2 text-xl">
            <Check ok label={`端末:${env.device}`} />
            <Check ok={env.osVersion !== null} label={`iOS:${env.osVersion ?? "分からない(デスクトップ表示の iPad など)"}`} />
            <Check ok={env.safariVersion !== null} label={`Safari:${env.safariVersion ?? "分からない"}`} />
            <Check ok={env.isSecure} label={env.isSecure ? "HTTPS でつながっている" : "HTTPS ではないので、マイクが使えません"} />
            <Check ok={env.hasRecognition} label={env.hasRecognition ? "音声認識がある" : "音声認識がない"} />
            <Check ok={env.hasSynthesis} label={env.hasSynthesis ? "読み上げがある" : "読み上げがない"} />
            <Check ok={voices.length > 0} label={`日本語の声:${voices.length} 種類`} />
          </ul>
        ) : (
          <p className="text-xl">しらべています…</p>
        )}
        {env && <p className="break-all text-sm text-zinc-500">{env.userAgent}</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-2xl font-bold">音声の動き(原因調べ用)</h2>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(events.join("\n"))}
          className="self-start rounded-xl bg-amber-100 px-4 py-2 text-lg"
        >
          コピー
        </button>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm">{events.join("\n") || "まだありません"}</pre>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-2xl font-bold">聞き取れた言葉(この画面だけ。保存しません)</h2>
        {log.length === 0 ? (
          <p className="text-xl text-zinc-500">まだありません</p>
        ) : (
          <ul className="grid gap-2 text-xl">
            {log.map((e, i) => (
              <li key={i}>
                <span className="text-zinc-500">{e.at}</span> {e.heard}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function MoodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-5 py-4 text-xl ${
        active ? "bg-amber-600 text-white" : "bg-amber-100 active:bg-amber-200"
      }`}
    >
      {children}
    </button>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={ok ? "text-emerald-600" : "text-rose-600"}>{ok ? "○" : "✕"}</span>
      <span>{label}</span>
    </li>
  );
}
