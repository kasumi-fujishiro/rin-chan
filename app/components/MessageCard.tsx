"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry, Message } from "../lib/familyStore";
import { usePhotoUrl } from "../lib/usePhotoUrl";

// 家族からの伝言。本人が押したときだけ、家族の声で流す
export function MessageCard({
  message,
  person,
  onPlay,
  onHeard,
}: {
  message: Message;
  // 「人」に同じ呼び方で登録されていれば、その写真を出す
  person?: Entry;
  onPlay: () => void;
  onHeard: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const photo = usePhotoUrl(person?.photo);

  useEffect(() => () => audioRef.current?.pause(), []);

  const play = () => {
    onPlay();
    audioRef.current?.pause();
    const url = URL.createObjectURL(message.audio);
    const audio = new Audio(url);
    audioRef.current = audio;
    const done = () => {
      setPlaying(false);
      URL.revokeObjectURL(url);
    };
    audio.onended = () => {
      done();
      onHeard();
    };
    audio.onerror = done;
    setPlaying(true);
    void audio.play().catch(done);
  };

  return (
    <button
      type="button"
      onClick={play}
      disabled={playing}
      className="flex w-full max-w-xl items-center gap-4 rounded-3xl border-4 border-amber-300 bg-amber-50 p-4 text-left shadow active:scale-95"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-24 w-24 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-amber-200 text-5xl">
          ▶
        </span>
      )}
      <span className="flex flex-col">
        <span className="text-3xl font-bold">{message.from}から伝言があります</span>
        <span className="text-2xl text-amber-800">
          {playing ? "流れています…" : message.heardAt ? "もう一度きく ▶" : "おして、きいてください ▶"}
        </span>
      </span>
    </button>
  );
}
