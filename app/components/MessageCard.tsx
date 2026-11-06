"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry, Message } from "../lib/familyStore";
import { setAudioSession } from "../lib/speech";
import { usePhotoUrl } from "../lib/usePhotoUrl";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const photo = usePhotoUrl(person?.photo);

  useEffect(
    () => () => {
      if (audioRef.current && !audioRef.current.paused) setAudioSession("auto");
      audioRef.current?.pause();
    },
    [],
  );

  const play = () => {
    onPlay();
    audioRef.current?.pause();
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
    const url = URL.createObjectURL(message.audio);
    const audio = new Audio(url);
    audioRef.current = audio;
    const done = () => {
      setPlaying(false);
      URL.revokeObjectURL(url);
      setAudioSession("auto");
    };
    audio.onended = () => {
      done();
      onHeard();
    };
    audio.onerror = done;
    setPlaying(true);
    setAudioSession("playback");
    void audio.play().catch(done);
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
