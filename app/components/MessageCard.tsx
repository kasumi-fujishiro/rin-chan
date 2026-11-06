"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry, Message } from "../lib/familyStore";
import { usePhotoUrl } from "../lib/usePhotoUrl";

type Stop = () => void;

// 声は Web Audio で流す。音の小さい録音も聞こえるように大きさをそろえ、終わったら音の経路を閉じる
function playVoice(blob: Blob, onEnd: () => void, onFail: () => void): Stop {
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return playWithElement(blob, onEnd, onFail);
  // 押した瞬間に作らないと、iPad で音が出ない
  const ctx = new Ctx();
  void ctx.resume();
  let stopped = false;
  let finished = false;
  let source: AudioBufferSourceNode | undefined;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let fallback: Stop | undefined;
  const close = () => {
    clearTimeout(limit);
    if (ctx.state !== "closed") void ctx.close();
  };
  const finish = () => {
    if (finished || stopped) return;
    finished = true;
    close();
    onEnd();
  };
  blob
    .arrayBuffer()
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      if (stopped) return;
      let peak = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const samples = buffer.getChannelData(c);
        for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      }
      const gain = ctx.createGain();
      gain.gain.value = peak > 0 ? Math.min(0.95 / peak, 6) : 1;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      source.onended = finish;
      source.start();
      // 終わりの知らせが来なくても、押せなくならないように
      limit = setTimeout(finish, (buffer.duration + 2) * 1000);
    })
    .catch(() => {
      close();
      if (!stopped) fallback = playWithElement(blob, onEnd, onFail);
    });
  return () => {
    stopped = true;
    fallback?.();
    try {
      source?.stop();
    } catch {
      // まだ始まっていないとき
    }
    close();
  };
}

function playWithElement(blob: Blob, onEnd: () => void, onFail: () => void): Stop {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const release = () => URL.revokeObjectURL(url);
  audio.onended = () => {
    release();
    onEnd();
  };
  const fail = () => {
    release();
    onFail();
  };
  audio.onerror = fail;
  void audio.play().catch(fail);
  return () => audio.pause();
}

// 家族からの伝言。本人が押したときだけ、家族の声で流し、字幕を大きく出す。
// 聞いたあとは「わかった」で閉じられる(返事をしたときも閉じる)
export function MessageCard({
  message,
  person,
  onPlay,
  onHeard,
  onDone,
  speakText,
  slim = false,
}: {
  message: Message;
  // 「人」に同じ呼び方で登録されていれば、その写真を出す
  person?: Entry;
  onPlay: () => void;
  onHeard: () => void;
  onDone: () => void;
  // 文字だけの伝言(LINE から)は、リンちゃんの声で読み上げる
  speakText: (text: string, onEnd: () => void) => void;
  // リンちゃんの返事や写真が一緒に出ているときは、1行にしてボタンが画面の外に出ないようにする
  slim?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const photo = usePhotoUrl(person?.photo);

  useEffect(() => () => stopRef.current?.(), []);

  const play = () => {
    onPlay();
    stopRef.current?.();
    if (!message.audio) {
      setPlaying(true);
      speakText(`${message.from}からです。${message.text ?? ""}`, () => {
        setPlaying(false);
        onHeard();
      });
      // 読み上げが止められても、押せなくならないように
      setTimeout(() => setPlaying(false), 30_000);
      return;
    }
    setPlaying(true);
    stopRef.current = playVoice(
      message.audio,
      () => {
        setPlaying(false);
        onHeard();
      },
      () => setPlaying(false),
    );
  };

  const oneLine = slim && !playing;
  const thumb = oneLine ? "h-14 w-14" : "h-24 w-24";

  return (
    <div
      className={`flex w-full max-w-xl gap-3 rounded-3xl border-4 border-amber-300 bg-amber-50 shadow ${
        oneLine ? "items-center justify-between p-2" : "flex-col p-4"
      }`}
    >
      <button
        type="button"
        onClick={play}
        disabled={playing}
        className="flex items-center gap-4 text-left active:scale-95"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className={`${thumb} shrink-0 rounded-2xl object-cover`} />
        ) : (
          <span className={`${thumb} flex shrink-0 items-center justify-center rounded-2xl bg-amber-200 text-4xl`}>
            ▶
          </span>
        )}
        {/* 案内の文は本人が読み上げてしまうので、誰からかと ▶ だけにする */}
        <span className="text-3xl font-bold">
          {message.from}から {playing ? "♪" : "▶"}
        </span>
      </button>
      {!oneLine && message.text && (playing || message.heardAt) && (
        <p className="rounded-2xl bg-white p-3 text-4xl leading-snug font-bold">{message.text}</p>
      )}
      {message.heardAt && !playing && (
        <button
          type="button"
          onClick={onDone}
          className="self-end rounded-full bg-amber-600 px-8 py-3 text-2xl text-white"
        >
          わかった
        </button>
      )}
    </div>
  );
}
