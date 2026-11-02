"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type Anthropic from "@anthropic-ai/sdk";
import { StandaloneWarning } from "./StandaloneWarning";
import { Rin, type RinMood } from "./Rin";
import { useRecognition, useSpeaker } from "../lib/speech";
import { appendTrialLog, isReask } from "../lib/trialLog";
import { getSettings, listEntries, requestPersist, toProfile, type Entry } from "../lib/familyStore";
import type { Profile } from "../lib/types";
import { usePhotoUrl } from "../lib/usePhotoUrl";

type Turn = Anthropic.MessageParam & { content: string };

// 返事に名前が出てきた登録を探す(長い名前を優先)。その写真を大きく見せる
function findMentioned(reply: string, entries: Entry[]): Entry | null {
  return (
    [...entries]
      .filter((e) => e.photo && e.name && reply.includes(e.name))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  );
}

export function Talk() {
  const router = useRouter();
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState("ボタンを押して、話しかけてくださいね。");
  const [thinking, setThinking] = useState(false);
  const [bigText, setBigText] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shown, setShown] = useState<Entry | null>(null);
  const photoUrl = usePhotoUrl(shown?.photo);
  // 直前の返事に対して、何回聞き返されたか
  const reaskRef = useRef(0);
  const speaker = useSpeaker();

  useEffect(() => {
    (async () => {
      const [settings, list] = await Promise.all([getSettings(), listEntries()]);
      setEntries(list);
      setProfile(toProfile(settings, list));
      void requestPersist();
    })();
  }, []);

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
          body: JSON.stringify({ messages, reask, profile }),
        });
        text = ((await res.json()) as { reply: string }).reply;
      } catch {
        text = "ごめんなさい、いま、うまくつながりません。";
      }
      setThinking(false);

      setHistory([...messages, { role: "assistant", content: text }]);
      setReply(text);
      // 聞き返されたときは、前の写真をそのまま見せ続ける
      setShown((prev) => findMentioned(text, entries) ?? (reask > 0 ? prev : null));
      // 2回目以降の聞き返しは、画面にも大きな文字で出す
      setBigText(reask >= 2);
      speaker.speak(text, { rate: reask >= 1 ? 0.7 : 0.8 });
      appendTrialLog({ at: new Date().toISOString(), heard, reply: text, reask });
    },
    [history, speaker, profile, entries],
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
    if (rec.listening) {
      rec.stop();
    } else {
      // start は読み上げ中(unlock の無音を含む)なら止めて少し待ってから聞き始める
      rec.start();
    }
    speaker.cancel();
  };

  // 家族用の入口:リンちゃんを2秒長押しすると登録画面へ(本人がふだん触らない場所)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = () => {
    holdTimer.current = setTimeout(() => router.push("/family"), 2000);
  };
  const holdEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  const mood: RinMood = speaker.speaking ? "speaking" : rec.listening ? "listening" : "waiting";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="flex w-full items-center justify-center gap-6">
        <div
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          className="touch-none select-none [-webkit-touch-callout:none]"
        >
          <Rin mood={mood} size={photoUrl ? 200 : 340} />
        </div>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={shown?.name ?? ""} className="max-h-[45dvh] max-w-[60%] rounded-3xl object-contain shadow-lg" />
        )}
      </div>
      <p
        className={`min-h-[4em] text-center font-bold leading-relaxed ${bigText ? "text-6xl" : "text-4xl"}`}
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
      <StandaloneWarning />
      {rec.error && (
        <p role="alert" className="w-full rounded-2xl bg-rose-100 p-4 text-xl text-rose-900">
          {rec.error}
        </p>
      )}
      {!profile && (
        <p className="text-base text-zinc-400">まだ家族の登録がありません(見本の内容で動いています)</p>
      )}
      {/* 長押しが使えないときのための入口。本人の目に入りにくいよう、小さく薄くする */}
      <Link href="/family" className="fixed right-4 bottom-3 text-sm text-zinc-400">
        家族の方へ
      </Link>
    </main>
  );
}
