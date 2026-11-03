"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type Anthropic from "@anthropic-ai/sdk";
import { PhotoPicker, type PickState } from "./PhotoPicker";
import { StandaloneWarning } from "./StandaloneWarning";
import { Rin, type RinMood } from "./Rin";
import { useRecognition, useSpeaker } from "../lib/speech";
import { appendTrialLog, isReask, isVague } from "../lib/trialLog";
import { getSettings, listEntries, requestPersist, toProfile, type Entry } from "../lib/familyStore";
import type { Kind, Profile } from "../lib/types";
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
  const [pick, setPick] = useState<PickState | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
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
    // picked:「あれ」から写真で選んだもの。その名前を添えて Claude に渡す
    async (heard: string, picked?: Entry) => {
      const asked = !picked && history.length > 0 && isReask(heard);
      const reask = asked ? Math.min(reaskRef.current + 1, 3) : 0;
      reaskRef.current = reask >= 3 ? 0 : reask;

      const content = picked ? `${heard}\n(写真で「${picked.name}」を選びました)` : heard;
      const messages: Turn[] = [...history, { role: "user", content }];
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
      setShown((prev) => findMentioned(text, entries) ?? (picked?.photo ? picked : reask > 0 ? prev : null));
      // 2回目以降の聞き返しは、画面にも大きな文字で出す
      setBigText(reask >= 2);
      speaker.speak(text, { rate: reask >= 1 ? 0.7 : 0.8 });
      appendTrialLog({
        at: new Date().toISOString(),
        heard,
        reply: text,
        reask,
      });
    },
    [history, speaker, profile, entries],
  );

  // ---- 「あれ」→ 写真で選ぶ ----
  const guess = useCallback(
    async (heard: string, kind?: Kind) => {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heard,
          kind,
          recent: history.slice(-6),
          profile,
        }),
      });
      const data = (await res.json()) as {
        kind: Kind | "不明";
        candidates: string[];
      };
      const found = data.candidates
        .map((name) => entries.find((e) => e.name === name))
        .filter((e): e is Entry => !!e);
      return { kind: data.kind, candidates: found };
    },
    [history, profile, entries],
  );

  const showPhotos = useCallback(
    (heard: string, kind: Kind | "不明", candidates: Entry[], byKind: boolean) => {
      setPick({ stage: "photos", heard, kind, candidates, byKind });
      speaker.speak("これですか?", { rate: 0.8 });
    },
    [speaker],
  );

  const startPick = useCallback(
    async (heard: string) => {
      setThinking(true);
      let result: Awaited<ReturnType<typeof guess>> | null = null;
      try {
        result = await guess(heard);
      } catch {
        // 推測できなくても、ふつうの会話で続ける
      }
      setThinking(false);
      if (!result || (result.kind === "不明" && result.candidates.length === 0)) {
        // 「あのね、今日ね」のような、何かを指していない「あの」はふつうの会話にする
        void answer(heard);
      } else if (result.kind !== "不明" && result.candidates.length > 0) {
        showPhotos(heard, result.kind, result.candidates, false);
      } else {
        setPick({ stage: "kind", heard });
        speaker.speak("物ですか。人ですか。場所ですか。", { rate: 0.75 });
      }
    },
    [guess, answer, showPhotos, speaker],
  );

  const chooseKind = async (kind: Kind) => {
    if (!pick) return;
    setPickBusy(true);
    let candidates: Entry[] = [];
    try {
      candidates = (await guess(pick.heard, kind)).candidates;
    } catch {}
    setPickBusy(false);
    // 推測できなくても、その種類の登録が少なければそのまま見せる
    if (candidates.length === 0) candidates = entries.filter((e) => e.kind === kind).slice(0, 3);
    if (candidates.length === 0) {
      closePick(null);
      return;
    }
    showPhotos(pick.heard, kind, candidates, true);
  };

  // 最初の推測が外れたら、大きな3つのボタンで種類から選び直してもらう
  const notThis = () => {
    if (pick?.stage === "photos" && !pick.byKind) {
      setPick({ stage: "kind", heard: pick.heard });
      speaker.speak("物ですか。人ですか。場所ですか。", { rate: 0.75 });
    } else {
      closePick(null);
    }
  };

  const closePick = (chosen: Entry | null) => {
    if (!pick) return;
    const candidates = pick.stage === "photos" ? pick.candidates.map((e) => e.name) : [];
    const kind = pick.stage === "photos" ? pick.kind : "不明";
    setPick(null);
    if (chosen) {
      appendTrialLog({
        at: new Date().toISOString(),
        heard: pick.heard,
        reply: `(写真で「${chosen.name}」を選んだ)`,
        reask: 0,
        pick: { kind, candidates, chosen: chosen.name },
      });
      void answer(pick.heard, chosen);
    } else {
      const text = `大丈夫ですよ。あとで${profile?.familyCallName ?? "ご家族"}と一緒に見ましょうね。`;
      setReply(text);
      setShown(null);
      speaker.speak(text, { rate: 0.8 });
      appendTrialLog({
        at: new Date().toISOString(),
        heard: pick.heard,
        reply: text,
        reask: 0,
        pick: { kind, candidates, chosen: null },
      });
    }
  };

  // マイクが閉じてから返事を作る(iOS では同時に使うと読み上げが鳴らないことがある)
  useEffect(() => {
    if (!pending || rec.listening) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    // 「あれ」「あの」で、登録した名前が出てこないときは写真で選んでもらう
    const vague =
      entries.length > 0 &&
      isVague(pending) &&
      !isReask(pending) &&
      !entries.some((e) => e.name && pending.includes(e.name));
    if (vague) void startPick(pending);
    else void answer(pending);
  }, [pending, rec.listening, answer, startPick, entries]);

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
          <Rin mood={mood} size={pick ? 160 : photoUrl ? 200 : 340} />
        </div>
        {photoUrl && !pick && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={shown?.name ?? ""}
            className="max-h-[45dvh] max-w-[60%] rounded-3xl object-contain shadow-lg"
          />
        )}
      </div>
      {pick ? (
        <PhotoPicker
          pick={pick}
          busy={pickBusy}
          onKind={chooseKind}
          onChoose={closePick}
          onNone={notThis}
        />
      ) : (
        <>
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
        </>
      )}
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
