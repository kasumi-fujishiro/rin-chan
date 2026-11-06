"use client";

import { useEffect, useRef, useState } from "react";
import sample from "../../samples/replay.json";
import { getSettings, listEntries, type Entry, type Message } from "../lib/familyStore";
import { logToScript, parseScript, REPLAY_PHOTOS, type ReplayScene, type ReplayScript } from "../lib/replayScript";
import { useJapaneseVoices, useSpeaker } from "../lib/speech";
import { readTrialLog } from "../lib/trialLog";
import { usePhotoUrl } from "../lib/usePhotoUrl";
import { MessageCard } from "./MessageCard";
import { PhotoPicker, type PickState } from "./PhotoPicker";
import { Rin, type RinMood } from "./Rin";
import { SpotPhoto } from "./SpotPhoto";
import { formatClock, MicIcon, StopIcon } from "./Talk";

type View = {
  listening: boolean;
  interim: string;
  thinking: boolean;
  reply: string;
  big: boolean;
  relayBig: string | null;
  shown: Entry | null;
  room: Entry | null;
  spot: { x: number; y: number } | null;
  pick: PickState | null;
  chosen?: string;
  message: Message | null;
  note: { title: string; text: string } | null;
};

const EMPTY: View = {
  listening: false,
  interim: "",
  thinking: false,
  reply: "",
  big: false,
  relayBig: null,
  shown: null,
  room: null,
  spot: null,
  pick: null,
  message: null,
  note: null,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SAMPLE = sample as unknown as ReplayScript;

// 架空のイラストを、登録と同じ形にする(話す画面の部品をそのまま使うため)
async function loadPhotos(): Promise<Record<string, Entry>> {
  const pairs = await Promise.all(
    Object.entries(REPLAY_PHOTOS).map(async ([name, url]): Promise<[string, Entry]> => {
      const photo = await (await fetch(url)).blob();
      return [name, { id: name, kind: "物", name, note: "", photo, updatedAt: 0 }];
    }),
  );
  return Object.fromEntries(pairs);
}

// デモ動画を撮るためのページ。台本の通りに話す画面を再生する。Claude にも LINE にも何も送らない
export function Replay() {
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View>(EMPTY);
  const [photos, setPhotos] = useState<Record<string, Entry>>({});
  const [clock, setClock] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const runRef = useRef(0);
  const speaker = useSpeaker();
  const voices = useJapaneseVoices();
  const photoUrl = usePhotoUrl(view.shown?.photo);

  useEffect(() => {
    void loadPhotos().then(setPhotos);
    const tick = () => setClock(formatClock(new Date()));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  const stop = () => {
    runRef.current++;
    speaker.cancel();
    setPlaying(false);
    setView(EMPTY);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entryOf = (name: string): Entry =>
    photos[name] ?? { id: name, kind: "物", name, note: "", updatedAt: 0 };

  const play = async (scenes: ReplayScene[], callName: string) => {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    speaker.unlock();
    setPlaying(true);
    setView(EMPTY);
    // 読み上げが終わらない環境でも止まらないよう、長さに応じた時間で先に進む
    const speak = (text: string, slow = 1, lead = true) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 4000 + text.length * 320);
        speaker.speak(text, {
          voice: voices[0],
          rate: 0.8 * slow,
          lead: lead ? callName || undefined : undefined,
          onEnd: () => {
            clearTimeout(timer);
            resolve();
          },
        });
      });

    await sleep(1500);
    for (const scene of scenes) {
      for (const step of scene.steps) {
        if (!alive()) return;
        if (step.type === "user") {
          // 本物と同じように、聞き取った言葉が少しずつ出る
          setView((v) => ({ ...v, listening: true, interim: "", message: null, note: null, pick: null }));
          await sleep(700);
          for (let i = 1; i <= step.text.length && alive(); i++) {
            setView((v) => ({ ...v, interim: step.text.slice(0, i) }));
            await sleep(130);
          }
          await sleep(700);
          setView((v) => ({ ...v, listening: false, interim: "", thinking: true }));
          await sleep(900);
          setView((v) => ({ ...v, thinking: false }));
        } else if (step.type === "rin") {
          const room = step.spot ? entryOf(step.spot.room) : null;
          setView((v) => ({
            ...v,
            reply: step.text,
            big: !!step.big,
            relayBig: step.relayBig ?? null,
            shown: step.photo ? entryOf(step.photo) : null,
            room,
            spot: step.spot ? { x: step.spot.x, y: step.spot.y } : null,
            pick: null,
            message: null,
          }));
          await speak(step.text, step.slow ?? 1);
          await sleep(1200);
        } else if (step.type === "pick") {
          const candidates = step.candidates.map(entryOf);
          setView((v) => ({
            ...v,
            pick: { stage: "photos", heard: "", kind: "物", candidates, byKind: false },
            chosen: undefined,
          }));
          await speak("これですか?", 1, false);
          await sleep(1800);
          setView((v) => ({ ...v, chosen: step.chosen }));
          await sleep(1200);
        } else if (step.type === "message") {
          const message: Message = { id: "replay", from: step.from, text: step.text, createdAt: 0 };
          setView((v) => ({ ...v, reply: "", shown: null, room: null, spot: null, message }));
          await sleep(2000);
          setView((v) => ({ ...v, message: { ...message, heardAt: 1 } }));
          await speak(`${step.from}からです。${step.text}`);
          await sleep(800);
        } else {
          setView((v) => ({ ...v, note: { title: step.title, text: step.text } }));
          await sleep(4500);
        }
      }
      if (!alive()) return;
      await sleep(1500);
      setView(EMPTY);
      await sleep(800);
    }
    if (alive()) setPlaying(false);
  };

  const fromLog = async () => {
    const [settings, entries] = await Promise.all([getSettings(), listEntries()]);
    const script = logToScript(readTrialLog(), {
      userCallName: settings?.userCallName,
      familyCallName: settings?.familyCallName,
      people: entries.filter((e) => e.kind === "人").map((e) => e.name),
    });
    setCustom(JSON.stringify(script, null, 2));
    setError(script.scenes[0].steps.length ? "" : "記録がありません");
  };

  const playCustom = () => {
    try {
      const script = parseScript(custom);
      setError("");
      void play(script.scenes, script.callName);
    } catch {
      setError("台本を読めませんでした。形を確かめてください");
    }
  };

  if (!playing) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-8">
        <h1 className="text-3xl font-bold">再現モード(動画の撮影用)</h1>
        <p className="text-lg text-zinc-600">
          台本の通りに話す画面を再生します。内容は架空で、Claude にも LINE にも送りません。再生中は Esc
          か、右下の「再現」を押すと戻ります。
        </p>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => void play(SAMPLE.scenes, SAMPLE.callName)}
            className="rounded-2xl bg-amber-600 px-6 py-4 text-2xl text-white"
          >
            すべて再生
          </button>
          {SAMPLE.scenes.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => void play([s], SAMPLE.callName)}
              className="rounded-2xl bg-zinc-200 px-6 py-3 text-left text-xl"
            >
              {s.title}
            </button>
          ))}
        </div>
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow">
          <h2 className="text-xl font-bold">試用の記録から作る</h2>
          <p className="text-lg text-rose-800">
            呼び名と「人」の名前は架空のものに置き換えますが、話の中に本物の名前や場所が残ることがあります。公開する前に必ず全部読んで、直してください。
          </p>
          <button type="button" onClick={fromLog} className="self-start rounded-2xl bg-zinc-200 px-5 py-3 text-xl">
            この端末の記録を読み込む
          </button>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={10}
            placeholder="台本(JSON)をここに貼ることもできます"
            className="w-full rounded-xl border-2 p-3 font-mono text-base"
          />
          <button
            type="button"
            onClick={playCustom}
            disabled={!custom.trim()}
            className="self-start rounded-2xl bg-amber-600 px-5 py-3 text-xl text-white disabled:opacity-40"
          >
            この台本を再生
          </button>
          {error && <p className="text-lg text-rose-700">{error}</p>}
        </section>
      </main>
    );
  }

  const mood: RinMood = speaker.speaking ? "speaking" : view.listening ? "listening" : "waiting";
  const crowded = !!(view.shown || view.room || view.relayBig || view.message || view.note);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center justify-center gap-4 px-4 py-6">
      {!crowded && !view.listening && <p className="text-center text-3xl text-zinc-600">{clock}</p>}
      <div className="flex w-full items-center justify-center gap-6">
        <Rin mood={mood} size={crowded ? 150 : 290} still={crowded} />
        {view.room?.photo && view.spot && !view.pick ? (
          <div className="relative">
            <SpotPhoto room={view.room.photo} spot={view.spot} className="max-h-[40dvh] shadow-lg" />
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={view.shown?.name ?? ""}
                className="absolute -right-4 -bottom-4 h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-lg"
              />
            )}
          </div>
        ) : (
          photoUrl &&
          !view.pick && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={view.shown?.name ?? ""}
              className="max-h-[36dvh] max-w-[60%] rounded-3xl object-contain shadow-lg"
            />
          )
        )}
      </div>
      {view.relayBig && !view.pick && !view.listening && !view.thinking && (
        <div className="w-full max-w-2xl rounded-3xl border-4 border-sky-200 bg-sky-50 p-4 text-center">
          <p className="text-2xl text-sky-800">ご家族から</p>
          <p className="text-5xl font-bold leading-snug">{view.relayBig}</p>
        </div>
      )}
      {view.message && !view.pick && !view.listening && !view.thinking && (
        <MessageCard
          message={view.message}
          onPlay={() => {}}
          onHeard={() => {}}
          onDone={() => {}}
          speakText={() => {}}
        />
      )}
      {view.note && (
        <div className="w-full max-w-2xl rounded-3xl border-4 border-emerald-200 bg-emerald-50 p-4">
          <p className="text-2xl text-emerald-800">{view.note.title}</p>
          <p className="text-3xl leading-snug font-bold">{view.note.text}</p>
        </div>
      )}
      {view.pick ? (
        <PhotoPicker
          pick={view.pick}
          busy={false}
          chosen={view.chosen}
          onKind={() => {}}
          onChoose={() => {}}
          onNone={() => {}}
        />
      ) : (
        <>
          <p
            className={`text-center font-bold leading-relaxed ${
              view.big ? "text-6xl" : view.relayBig ? "text-3xl" : crowded ? "text-4xl" : "min-h-[3em] text-4xl"
            }`}
          >
            {view.listening ? view.interim : view.thinking ? "……" : view.reply}
          </p>
          <div
            className={`${crowded ? "h-24" : "h-32"} flex w-full max-w-md items-center justify-center rounded-full text-white shadow-lg ${
              view.listening ? "animate-pulse bg-rose-500" : "bg-amber-600"
            }`}
          >
            {view.listening ? <StopIcon /> : <MicIcon />}
          </div>
          {!view.listening && (
            <div className="rounded-full bg-sky-100 px-8 py-4 text-2xl text-sky-900">ご家族が伝える</div>
          )}
        </>
      )}
      {/* 本物の場面だと誤解されないよう、再現であることを必ず画面に出す */}
      <button type="button" onClick={stop} className="fixed right-4 bottom-3 text-base text-zinc-500">
        再現
      </button>
    </main>
  );
}
