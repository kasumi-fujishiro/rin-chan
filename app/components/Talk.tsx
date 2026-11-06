"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCard } from "./MessageCard";
import { RinPromptCard } from "./RinPromptCard";
import { SpotPhoto } from "./SpotPhoto";
import { PhotoPicker, type PickState } from "./PhotoPicker";
import { StandaloneWarning } from "./StandaloneWarning";
import { Rin, type RinMood } from "./Rin";
import { useJapaneseVoices, useRecognition, useSpeaker } from "../lib/speech";
import { appendTrialLog, isReask, isScreenEcho, isVague } from "../lib/trialLog";
import {
  DEFAULT_VOICE,
  getSettings,
  listEntries,
  listMessages,
  putMessage,
  requestPersist,
  toProfile,
  type Entry,
  type Message,
  type Settings,
} from "../lib/familyStore";
import type { Kind, Profile } from "../lib/types";
import { usePhotoUrl } from "../lib/usePhotoUrl";
import { useWakeLock } from "../lib/useWakeLock";
import { pullLineMessages } from "../lib/lineInbox";
import {
  clearConversation,
  freshIfStale,
  GAP_MS,
  loadConversation,
  loadToday,
  saveConversation,
  saveToday,
  takeStaleConversation,
  type Turn,
} from "../lib/conversation";
import { markRinPromptUsed, pickRinPrompt, pickTakeover, type RinPrompt } from "../lib/rinPrompt";
import { afterCall, isSearching } from "../lib/wake";

// 本人の言葉と返事に名前が出てきた登録を探す(長い名前を優先)。その写真を大きく見せる
// 「眼鏡は居間に」のように物と場所が両方出たら、物を優先する(物の置き場所の写真に場所も写るため)
const KIND_ORDER = { 物: 0, 人: 1, 場所: 2 } as const;

function findMentioned(reply: string, entries: Entry[]): Entry | null {
  return (
    [...entries]
      .filter((e) => (e.photo || e.spot) && e.name && reply.includes(e.name))
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.name.length - a.name.length)[0] ?? null
  );
}

// 「11月4日(水) 午後3時20分」の形。24時間表記は朝か夕方か分かりにくいので使わない
export function formatClock(d: Date) {
  const date = d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  const h = d.getHours();
  return `${date} ${h < 12 ? "午前" : "午後"}${h % 12 || 12}時${d.getMinutes()}分`;
}

// 区切れた会話を今日のメモにまとめる。失敗しても会話は止めない
async function digest(turns: Turn[], profile: Profile | null) {
  if (turns.length === 0) return;
  try {
    const res = await fetch("/api/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns, previous: loadToday(), profile }),
    });
    const { summary } = (await res.json()) as { summary?: string };
    if (summary) saveToday(summary);
  } catch {
    // 次の区切りでまとめ直す
  }
}

export function Talk() {
  const router = useRouter();
  const [history, setHistory] = useState<Turn[]>([]);
  // 画面の文字は本人が読み上げてしまうので、最初は何も出さない
  const [reply, setReply] = useState("");
  const [thinking, setThinking] = useState(false);
  const [bigText, setBigText] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shown, setShown] = useState<Entry | null>(null);
  const [pick, setPick] = useState<PickState | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  // リンちゃんからの話しかけを出すかの判断に使う(最後に話した時刻と、30秒ごとの時計)
  const [lastActivity, setLastActivity] = useState(0);
  const [now, setNow] = useState(0);
  // 直前にリンちゃんから話しかけたきっかけ。次の本人の言葉を「その反応」として記録する
  const promptRef = useRef<string | null>(null);
  // 伝言を聞き終えて、本人の返事を待っているとき
  const messageReplyRef = useRef<Message | null>(null);
  // 「ご家族が伝える」で聞いている間は true。聞き取った言葉を本人向けに言い直す
  const [relayMode, setRelayMode] = useState(false);
  // 家族の言葉の要点。画面に大きく出す
  const [relayBig, setRelayBig] = useState<string | null>(null);
  const photoUrl = usePhotoUrl(shown?.photo);
  // 直前の返事に対して、何回聞き返されたか
  const reaskRef = useRef(0);
  const speaker = useSpeaker();
  useWakeLock();
  // 家族が選んだ声・速さ・高さで話す。slow は聞き返しなどでさらにゆっくりにするときの倍率
  const voices = useJapaneseVoices();
  const [voiceSetting, setVoiceSetting] = useState(DEFAULT_VOICE);
  const voice = voices.find((v) => v.name === voiceSetting.name);
  // 話し終わったら、本人の返事をそのまま聞き取るか(毎回ボタンを押すのが難しかったため)
  const listenAfterRef = useRef(false);
  const [autoListening, setAutoListening] = useState(false);
  // 呼びかけモード。iPad は一度触らないと声を出せないので、最初に画面に触ってから聞き始める
  const [wakeArmed, setWakeArmed] = useState(false);
  // 伝言を流している間などは聞かない
  const [wakeHold, setWakeHold] = useState(false);
  // 呼ばれずに出した写真。本人が触らなければ、しばらくして片付ける
  const [quiet, setQuiet] = useState(false);
  const quietAtRef = useRef(0);
  const say = useCallback(
    (text: string, slow = 1, listenAfter = true) => {
      listenAfterRef.current = listenAfter;
      // 最初に必ず呼び名で呼びかけてから本題に入る(試用で、話の後半しか聞いていないことがあったため)
      speaker.speak(text, {
        voice,
        rate: voiceSetting.rate * slow,
        pitch: voiceSetting.pitch,
        lead: settings?.userCallName || undefined,
      });
    },
    [speaker, voice, voiceSetting, settings],
  );

  useEffect(() => {
    (async () => {
      const [settings, list, msgs] = await Promise.all([getSettings(), listEntries(), listMessages()]);
      setEntries(list);
      setMessages(msgs);
      setSettings(settings);
      if (settings?.voice) setVoiceSetting(settings.voice);
      const nextProfile = toProfile(settings, list);
      // 閉じている間に区切れた会話は、今日のメモにまとめておく
      void digest(takeStaleConversation(), nextProfile);
      // 30分以内に話していたら、再読み込みしても会話の流れを続ける
      const restored = loadConversation();
      if (restored.length) {
        setHistory(restored);
        setLastActivity(Date.now());
      }
      setProfile(nextProfile);
      void requestPersist();
    })();
  }, []);

  // 会話の流れを iPad の中に残す(再読み込みしても続くように)
  useEffect(() => {
    if (history.length) saveConversation(history);
  }, [history]);

  const onFinal = useCallback((text: string) => setPending(text), []);
  const rec = useRecognition(onFinal);

  const answer = useCallback(
    // picked:「あれ」から写真で選んだもの。その名前を添えて Claude に渡す
    async (heard: string, picked?: Entry) => {
      // 30分以上空いていたら、前の話題を持ち込まず新しい会話として始める
      setQuiet(false);
      const base = freshIfStale(history, lastActivity);
      const asked = !picked && base.length > 0 && isReask(heard);
      const reask = asked ? Math.min(reaskRef.current + 1, 3) : 0;
      reaskRef.current = reask >= 3 ? 0 : reask;

      const content = picked ? `${heard}\n(写真で「${picked.name}」を選びました)` : heard;
      const messages: Turn[] = [...base, { role: "user", content }];
      setThinking(true);
      let text: string;
      let ignored = false;
      try {
        const res = await fetch("/api/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, reask, profile, today: loadToday() }),
        });
        const data = (await res.json()) as { reply?: string; ignored?: boolean };
        ignored = !!data.ignored;
        text = data.reply ?? "";
      } catch {
        text = "ごめんなさい、いま、うまくつながりません。";
      }
      setThinking(false);

      // テレビなどの声だったときは、何もしない(画面の文字も本人が読んでしまうので出さない。会話にも入れない)
      if (ignored) {
        reaskRef.current = Math.max(0, reask - 1);
        appendTrialLog({
          at: new Date().toISOString(),
          heard,
          reply: "(テレビなどの声として返事をしなかった)",
          reask,
          ignored: true,
        });
        return;
      }

      setHistory([...messages, { role: "assistant", content: text }]);
      setReply(text);
      // 聞き返されたときは、前の写真をそのまま見せ続ける
      setShown(
        (prev) =>
          findMentioned(`${heard} ${text}`, entries) ??
          (picked?.photo || picked?.spot ? picked : reask > 0 ? prev : null),
      );
      // 2回目以降の聞き返しは、画面にも大きな文字で出す
      setBigText(reask >= 2);
      // 本人が新しく話したら、家族の言葉の表示は消す(聞き返しのあいだは残す)
      if (reask === 0) setRelayBig(null);
      say(text, reask >= 1 ? 0.88 : 1);
      appendTrialLog({
        at: new Date().toISOString(),
        heard,
        reply: text,
        reask,
        reactionTo: promptRef.current ?? undefined,
      });
      promptRef.current = null;
      setLastActivity(Date.now());
    },
    [history, lastActivity, say, profile, entries],
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
          // 30分以上前の話題は手がかりにしない。家族が伝えた言葉や伝言は、会話に入っているので手がかりになる
          recent: freshIfStale(history, lastActivity).slice(-6),
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
    [history, lastActivity, profile, entries],
  );

  const showPhotos = useCallback(
    (heard: string, kind: Kind | "不明", candidates: Entry[], byKind: boolean) => {
      setPick({ stage: "photos", heard, kind, candidates, byKind });
      say("これですか?", 1, false);
    },
    [say],
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
        say("物ですか。人ですか。場所ですか。", 0.94, false);
      }
    },
    [guess, answer, showPhotos, say],
  );

  // 探し物の言葉が聞こえたら、声は出さずに写真だけ見せる(テレビの声で話し出さないように)
  const showQuietly = useCallback(
    async (heard: string) => {
      const named = entries.find((e) => e.name && heard.replace(/\s/g, "").includes(e.name) && (e.photo || e.spot));
      if (named) {
        setShown(named);
        setQuiet(true);
      } else {
        const result = await guess(heard).catch(() => null);
        // 「あれどこかしら」だけでは手がかりがないので、探すことの多い物の写真を見せる
        const candidates = result?.candidates.length
          ? result.candidates
          : entries.filter((e) => e.kind === "物" && e.photo).slice(0, 3);
        if (candidates.length === 0) return;
        setPick({ stage: "photos", heard, kind: result?.kind ?? "物", candidates, byKind: false });
        setQuiet(true);
      }
      appendTrialLog({
        at: new Date().toISOString(),
        heard,
        reply: "(呼びかけモードで、声を出さずに写真を出した)",
        reask: 0,
      });
    },
    [entries, guess],
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
      say("物ですか。人ですか。場所ですか。", 0.94, false);
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
      say(text);
      appendTrialLog({
        at: new Date().toISOString(),
        heard: pick.heard,
        reply: text,
        reask: 0,
        pick: { kind, candidates, chosen: null },
      });
    }
  };

  // ---- 家族の言葉を、本人に伝わる形に言い直す ----
  const relay = useCallback(
    async (heard: string) => {
      setThinking(true);
      let data: { say?: string; big?: string; entry?: string | null; error?: boolean } = {};
      try {
        const res = await fetch("/api/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 「それ」「さっきの」が分かるよう、直前の会話も渡す
          body: JSON.stringify({ heard, profile, recent: freshIfStale(history, lastActivity).slice(-6) }),
        });
        data = await res.json();
      } catch {
        data = { error: true };
      }
      setThinking(false);
      if (!data.say) {
        setReply("ごめんなさい、うまく聞き取れませんでした。もう一度、押して話してください。");
        return;
      }
      const entry = data.entry ? entries.find((e) => e.name === data.entry) : undefined;
      setReply(data.say);
      setRelayBig(data.big || null);
      setBigText(false);
      setShown(entry?.photo || entry?.spot ? entry : null);
      say(data.say, 0.94);
      // このあと本人が「え?」と聞き返したら、いつもの言い直しが働くように会話に入れておく
      setHistory((h) => [
        ...h,
        { role: "user", content: `(ご家族が伝えたいこと:${heard})` },
        { role: "assistant", content: data.say! },
      ]);
      reaskRef.current = 0;
      setLastActivity(Date.now());
      appendTrialLog({ at: new Date().toISOString(), heard, reply: data.say, reask: 0, relay: true });
    },
    [profile, entries, say, history, lastActivity],
  );

  // 自動で聞き取るときに使う最新の値。rec などは描画のたびに作り直されるので、タイマーが消されないよう ref から読む
  const latest = useRef({ rec, pick, thinking });
  useEffect(() => {
    latest.current = { rec, pick, thinking };
  });
  // LINE で家族が送った伝言を、1分ごとに取りに行く(合言葉が入っているときだけ)
  const lineKey = settings?.lineKey;
  useEffect(() => {
    if (!lineKey) return;
    let stopped = false;
    const pull = async () => {
      try {
        const latestSettings = await getSettings();
        const added = await pullLineMessages(latestSettings);
        if (stopped || added.length === 0) return;
        setMessages(await listMessages());
        setSettings(latestSettings);
        // 届いたことを、そっと声でも知らせる(画面を見ていないことがあるため)
        const { rec, pick, thinking } = latest.current;
        if (!rec.listening && !pick && !thinking && !speechSynthesis.speaking) {
          say(`${added[0].from}から、伝言が届きましたよ。`, 1, false);
        }
      } catch {
        // つながらないときは、次の回にまた取りに行く
      }
    };
    void pull();
    const timer = setInterval(pull, 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey]);

  // 伝言は、終えていないもののうち、まだ聞いていない新しいものを先に出す(試用で、ずっと出ていて何度も押していたため)
  const openMessages = messages.filter((m) => !m.doneAt);
  const message = openMessages.find((m) => !m.heardAt) ?? openMessages[0];
  const saveMessage = async (updated: Message) => {
    await putMessage(updated);
    setMessages((list) => list.map((x) => (x.id === updated.id ? updated : x)));
  };
  const heardMessage = async (m: Message) => {
    const updated = { ...m, heardAt: Date.now() };
    await saveMessage(updated);
    // リンちゃんも伝言の中身を知っておく(あとで「何て言ってた?」と聞かれたときのため)
    if (m.text)
      setHistory((h) => [...h, { role: "user", content: `(${m.from}からの伝言を聞きました:「${m.text}」)` }]);
    appendTrialLog({
      at: new Date().toISOString(),
      heard: "(伝言を押した)",
      reply: `${m.from}からの伝言を聞いた`,
      reask: 0,
    });
    // 聞き終わったら、そのまま返事を聞き取る(試用で、押す前に返事をしてしまっていたため)
    messageReplyRef.current = updated;
    setTimeout(() => {
      const { rec, pick, thinking } = latest.current;
      if (rec.listening || pick || thinking) return;
      setAutoListening(true);
      setRelayMode(false);
      rec.start();
    }, 300);
  };
  const finishMessage = async (m: Message, reply?: string) => {
    await saveMessage({ ...m, doneAt: Date.now(), reply });
  };

  // マイクが閉じてから返事を作る(iOS では同時に使うと読み上げが鳴らないことがある)
  useEffect(() => {
    if (!pending || rec.listening) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    if (relayMode) {
      setRelayMode(false);
      void relay(pending);
      return;
    }
    // 画面の文字を読んだだけの声には返事をしない
    const shownMessage = messages.find((m) => !m.doneAt && m.heardAt);
    if (
      isScreenEcho(pending, [
        reply,
        relayBig ?? "",
        shownMessage?.text ?? "",
        shownMessage ? `${shownMessage.from}から` : "",
      ])
    ) {
      appendTrialLog({
        at: new Date().toISOString(),
        heard: pending,
        reply: "(画面の文字を読んだ声として返事をしなかった)",
        reask: 0,
        ignored: true,
      });
      return;
    }
    // 伝言を聞いたあとの返事は、伝言を出した家族への返事として残し、カードを閉じる
    const replied = messageReplyRef.current;
    if (replied) {
      messageReplyRef.current = null;
      void finishMessage(replied, pending);
      // 家族の LINE にも、その場で知らせる(合言葉が入っていて、知らせる設定のとき)
      if (settings?.lineKey && settings.notifyReplies !== false) {
        void fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-rin-key": settings.lineKey },
          body: JSON.stringify({
            from: replied.from,
            message: replied.text,
            reply: pending,
            userCallName: settings.userCallName,
          }),
        }).catch(() => {});
      }
      const text = `${replied.from}に、伝えておきますね。`;
      setReply(text);
      setShown(null);
      say(text, 1, false);
      appendTrialLog({
        at: new Date().toISOString(),
        heard: pending,
        reply: text,
        reask: 0,
        reactionTo: `${replied.from}からの伝言`,
      });
      return;
    }
    // 「あれ」「あの」で、登録した名前が出てこないときは写真で選んでもらう
    const vague =
      entries.length > 0 &&
      isVague(pending) &&
      !isReask(pending) &&
      !entries.some((e) => e.name && pending.includes(e.name));
    if (vague) void startPick(pending);
    else void answer(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, rec.listening, answer, startPick, entries, relayMode, relay, reply, relayBig, messages, say, settings]);

  const onButton = (forFamily = false) => {
    listenAfterRef.current = false;
    messageReplyRef.current = null;
    setAutoListening(false);
    setQuiet(false);
    speaker.unlock();
    if (!rec.listening) setRelayMode(forFamily);
    if (rec.listening) {
      rec.stop();
    } else {
      // start は読み上げ中(unlock の無音を含む)なら止めて少し待ってから聞き始める。
      // 家族の言葉は、間があいても途中で切らない(試用で「今の」「ちょうどいいよ」と切れていたため)
      rec.start({ long: forFamily });
    }
    speaker.cancel();
  };

  // リンちゃんが話し終わったら、一度だけそのまま聞き取る。何も聞こえなければ待つ画面に戻る
  const wasSpeaking = useRef(false);
  useEffect(() => {
    const ended = wasSpeaking.current && !speaker.speaking;
    wasSpeaking.current = speaker.speaking;
    if (!ended || !listenAfterRef.current) return;
    listenAfterRef.current = false;
    setTimeout(() => {
      const { rec, pick, thinking } = latest.current;
      if (rec.listening || pick || thinking) return;
      // iPad が押さずに聞き取るのを許さないときは、エラーは出さずに待つ画面のままにする
      setAutoListening(true);
      setRelayMode(false);
      rec.start();
    }, 400);
  }, [speaker.speaking]);

  // ---- 呼びかけモード ----
  const wakeMode = !!settings?.wakeMode;
  useEffect(() => {
    if (!wakeMode || wakeArmed) return;
    const arm = () => {
      speaker.unlock();
      setWakeArmed(true);
    };
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, [wakeMode, wakeArmed, speaker]);

  const onWakeHeard = (text: string) => {
    const rest = afterCall(text, settings?.assistantName ?? "");
    if (rest !== null) {
      rec.stopWake();
      setWakeHold(true);
      setQuiet(false);
      appendTrialLog({ at: new Date().toISOString(), heard: "(呼びかけモードで名前を呼ばれた)", reply: rest, reask: 0 });
      // マイクが閉じてから話す(iOS では同時に使うと読み上げが鳴らないことがある)
      setTimeout(() => {
        setWakeHold(false);
        if (rest.length >= 2) {
          setPending(rest);
        } else {
          const hello = "はい、聞いていますよ。";
          setReply(hello);
          say(hello);
        }
      }, 300);
      return;
    }
    // テレビの声で何度も写真が出ないよう、一度出したらしばらく出さない
    if (Date.now() - quietAtRef.current < 60_000) return;
    if (!isSearching(text, entries.map((e) => e.name))) return;
    quietAtRef.current = Date.now();
    void showQuietly(text);
  };
  const wakeHeardRef = useRef(onWakeHeard);
  useEffect(() => {
    wakeHeardRef.current = onWakeHeard;
  });

  const wakeOn =
    wakeMode && wakeArmed && !wakeHold && !rec.listening && !speaker.speaking && !pick && !thinking && !pending && !relayMode;
  const { wake, stopWake } = rec;
  useEffect(() => {
    if (!wakeOn) return;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      wake(
        (text) => wakeHeardRef.current(text),
        (quick) => {
          timer = setTimeout(run, quick ? 15_000 : 300);
        },
      );
    };
    timer = setTimeout(run, 800);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", run);
      stopWake();
    };
  }, [wakeOn, wake, stopWake]);

  useEffect(() => {
    if (!quiet) return;
    const timer = setTimeout(() => {
      setPick(null);
      setShown(null);
      setQuiet(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [quiet]);

  // 家族用の入口:リンちゃんを2秒長押しすると登録画面へ(本人がふだん触らない場所)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      router.push("/family");
    }, 2000);
  };
  // リンちゃんを短く押したときは「はなす」と同じ(長押しは家族の入口)
  const held = useRef(false);
  const tapRin = () => {
    if (held.current || pick || thinking || rec.listening) return;
    onButton(false);
  };
  const holdEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  // まだ話していないか、2分以上会話がないときだけ、思い出の話題を出す
  // 30分話さなかったら、ここまでの会話を今日のメモにまとめて、新しい会話にする
  useEffect(() => {
    if (!lastActivity || !history.length || now - lastActivity <= GAP_MS) return;
    void digest(history, profile);
    clearConversation();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory([]);
  }, [now, lastActivity, history, profile]);
  const idle = history.length === 0 || now - lastActivity > 120_000;
  const rinPrompt = now ? pickRinPrompt(settings, entries, new Date(now), idle) : null;

  const tapRinPrompt = (prompt: RinPrompt) => {
    rec.stop();
    speaker.unlock();
    say(prompt.text);
    setReply(prompt.text);
    setBigText(false);
    setShown(prompt.entry?.photo ? prompt.entry : null);
    // Claude には「リンちゃんから話しかけた」流れとして渡す(会話の最初は本人の番である必要があるため)
    setHistory((h) => [
      ...h,
      { role: "user", content: "(リンちゃんから話しかけました)" },
      { role: "assistant", content: prompt.text },
    ]);
    promptRef.current = prompt.label;
    markRinPromptUsed(prompt, new Date());
    setLastActivity(Date.now());
    appendTrialLog({
      at: new Date().toISOString(),
      heard: "(リンちゃんから話しかけた)",
      reply: prompt.text,
      reask: 0,
      prompt: prompt.label,
    });
  };

  // 家族が疲れたときに、話し相手をリンちゃんに任せる。何があったかは本人に言わず、話題を移す
  const takeOver = () => {
    setPick(null);
    setRelayBig(null);
    setQuiet(false);
    messageReplyRef.current = null;
    tapRinPrompt(pickTakeover(settings, entries));
  };

  // 写真や「ご家族から」を出すときは、ほかを小さくして「はなす」が画面の外に出ないようにする
  // 置き場所を写真で示している物は、部屋の写真に印を付けて見せる
  const room = shown?.spot ? entries.find((e) => e.id === shown.spot!.roomId && e.photo) : undefined;
  const crowded = !!pick || !!photoUrl || !!room || !!relayBig;

  // 待っている間は、今日の日付と時刻を出す(日にちが分かるように)
  const clock = now ? formatClock(new Date(now)) : "";
  const dayServiceToday = !!now && !!settings?.dayService?.weekdays.includes(new Date(now).getDay());

  const mood: RinMood = speaker.speaking ? "speaking" : rec.listening ? "listening" : "waiting";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center justify-center gap-4 px-4 py-6">
      {!crowded && !rec.listening && clock && (
        <p className="text-center text-3xl text-zinc-600">
          {clock}
          {dayServiceToday && (
            <span className="mt-1 block text-2xl">
              今日は{settings?.dayService?.placeName || "デイサービス"}の日です
            </span>
          )}
        </p>
      )}
      <div className="flex w-full items-center justify-center gap-6">
        <div
          onPointerDown={holdStart}
          onClick={tapRin}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          className="touch-none select-none [-webkit-touch-callout:none]"
        >
          <Rin mood={mood} size={crowded ? 150 : 290} still={crowded} />
        </div>
        {room?.photo && shown?.spot && !pick ? (
          <div className="relative">
            <SpotPhoto
              room={room.photo}
              spot={shown.spot}
              className={`${relayBig ? "max-h-[24dvh]" : "max-h-[40dvh]"} shadow-lg`}
            />
            {photoUrl && (
              // 物そのものの写真を、部屋の写真の角に小さく重ねる
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={shown.name}
                className="absolute -right-4 -bottom-4 h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-lg"
              />
            )}
          </div>
        ) : (
          photoUrl &&
          !pick && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={shown?.name ?? ""}
              className={`${relayBig ? "max-h-[24dvh]" : "max-h-[36dvh]"} max-w-[60%] rounded-3xl object-contain shadow-lg`}
            />
          )
        )}
      </div>
      {relayBig && !pick && !rec.listening && !thinking && (
        <div className="w-full max-w-2xl rounded-3xl border-4 border-sky-200 bg-sky-50 p-4 text-center">
          <p className="text-2xl text-sky-800">ご家族から</p>
          <p className="text-5xl font-bold leading-snug">{relayBig}</p>
        </div>
      )}
      {rinPrompt && !pick && !rec.listening && !thinking && !speaker.speaking && (
        <RinPromptCard prompt={rinPrompt} onTap={() => tapRinPrompt(rinPrompt)} />
      )}
      {message && !pick && !rec.listening && !thinking && (
        <MessageCard
          message={message}
          person={entries.find((e) => e.kind === "人" && e.name === message.from)}
          onPlay={() => {
            rec.stop();
            speaker.cancel();
            setWakeHold(true);
            // 再生に失敗しても、聞き続けに戻れるように
            setTimeout(() => setWakeHold(false), 200_000);
          }}
          onHeard={() => {
            setWakeHold(false);
            void heardMessage(message);
          }}
          onDone={() => {
            messageReplyRef.current = null;
            void finishMessage(message);
          }}
          speakText={(text, onEnd) => {
            listenAfterRef.current = false;
            speaker.speak(text, {
              voice,
              rate: voiceSetting.rate,
              pitch: voiceSetting.pitch,
              lead: settings?.userCallName || undefined,
              onEnd,
            });
          }}
        />
      )}
      {pick ? (
        <PhotoPicker pick={pick} busy={pickBusy} onKind={chooseKind} onChoose={closePick} onNone={notThis} />
      ) : (
        <>
          <p
            className={`text-center font-bold leading-relaxed ${
              bigText ? "text-6xl" : relayBig ? "text-3xl" : crowded ? "text-4xl" : "min-h-[3em] text-4xl"
            }`}
            aria-live="polite"
          >
            {/* 聞いている間は、指示の文字を出さない(本人が読み上げてしまうため)。聞き取った言葉だけ出す */}
            {rec.listening ? rec.interim : thinking ? "……" : reply}
          </p>
          <button
            type="button"
            onClick={() => onButton(false)}
            disabled={thinking}
            aria-label={rec.listening ? "とめる" : "はなす"}
            className={`${crowded ? "h-24" : "h-32"} flex w-full max-w-md items-center justify-center rounded-full text-white shadow-lg active:scale-95 disabled:opacity-50 ${
              rec.listening ? "animate-pulse bg-rose-500" : "bg-amber-600"
            }`}
          >
            {/* 文字は読み上げられてしまうので、絵だけにする */}
            {rec.listening ? <StopIcon /> : <MicIcon />}
          </button>
          {/* 家族がそばで話すとき用。本人の「はなす」より控えめにする */}
          {!rec.listening && (
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => onButton(true)}
                disabled={thinking}
                className="rounded-full bg-sky-100 px-8 py-4 text-2xl text-sky-900 active:scale-95 disabled:opacity-50"
              >
                ご家族が伝える
              </button>
              <button
                type="button"
                onClick={takeOver}
                disabled={thinking}
                className="rounded-full bg-sky-100 px-8 py-4 text-2xl text-sky-900 active:scale-95 disabled:opacity-50"
              >
                リンちゃん、代わって
              </button>
            </div>
          )}
        </>
      )}
      <StandaloneWarning />
      {/* 聞き続けている間だけ出す、家族向けの小さな印。本人が読まないよう文字は出さない */}
      {rec.wakeLive && (
        <span role="img" aria-label="呼びかけモードで聞いています" className="fixed bottom-4 left-4 h-3 w-3 rounded-full bg-emerald-500" />
      )}
      {rec.error && !autoListening && (
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

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11Z" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-14 w-14" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
