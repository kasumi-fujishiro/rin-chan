"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { Rin, type RinMood } from "./Rin";
import { useRecognition, useSpeaker } from "../lib/speech";
import { appendTrialLog, isReask } from "../lib/trialLog";

type Turn = Anthropic.MessageParam & { content: string };

export function Talk() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState("ボタンを押して、話しかけてくださいね。");
  const [thinking, setThinking] = useState(false);
  const [bigText, setBigText] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  // 直前の返事に対して、何回聞き返されたか
  const reaskRef = useRef(0);
  const speaker = useSpeaker();

  const onFinal = useCallback((text: string) => setPending(text), []);
  const rec = useRecognition(onFinal);

  const answer = useCallback(
    async (heard: string) => {
      const asked = history.length > 0 && isReask(heard);
      const reask = asked ? Math.min(reaskRef.current + 1, 3) : 0;
      reaskRef.current = reask >= 3 ? 0 : reask;

      const messages: Turn[] = [...history, { role: "user", content: heard }];
      setThinking(true);
      let text: string;
      try {
        const res = await fetch("/api/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, reask }),
        });
        text = ((await res.json()) as { reply: string }).reply;
      } catch {
        text = "ごめんなさい、いま、うまくつながりません。";
      }
      setThinking(false);

      setHistory([...messages, { role: "assistant", content: text }]);
      setReply(text);
      // 2回目以降の聞き返しは、画面にも大きな文字で出す
      setBigText(reask >= 2);
      speaker.speak(text, { rate: reask >= 1 ? 0.7 : 0.8 });
      appendTrialLog({ at: new Date().toISOString(), heard, reply: text, reask });
    },
    [history, speaker],
  );

  // マイクが閉じてから返事を作る(iOS では同時に使うと読み上げが鳴らないことがある)
  useEffect(() => {
    if (!pending || rec.listening) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    void answer(pending);
  }, [pending, rec.listening, answer]);

  const onButton = () => {
    speaker.unlock();
    speaker.cancel();
    if (rec.listening) rec.stop();
    else rec.start();
  };

  const mood: RinMood = speaker.speaking ? "speaking" : rec.listening ? "listening" : "waiting";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-8 px-4 py-8">
      <Rin mood={mood} size={340} />
      <p
        className={`min-h-[4em] text-center font-bold leading-relaxed ${
          bigText ? "text-6xl" : "text-4xl"
        }`}
        aria-live="polite"
      >
        {rec.listening ? rec.interim || "どうぞ、お話しください。" : thinking ? "……" : reply}
      </p>
      <button
        type="button"
        onClick={onButton}
        disabled={thinking}
        className={`h-32 w-full max-w-md rounded-full text-5xl font-bold text-white shadow-lg active:scale-95 disabled:opacity-50 ${
          rec.listening ? "bg-rose-500" : "bg-amber-600"
        }`}
      >
        {rec.listening ? "とめる" : "はなす"}
      </button>
      {rec.error && (
        <p role="alert" className="w-full rounded-2xl bg-rose-100 p-4 text-xl text-rose-900">
          {rec.error}
        </p>
      )}
    </main>
  );
}
