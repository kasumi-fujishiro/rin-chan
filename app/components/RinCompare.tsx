"use client";

import Link from "next/link";
import { useState } from "react";
import { setRinLook, useRinLook, type RinLook } from "../lib/rinLook";
import { Rin, RIN_MOODS, type RinMood } from "./Rin";

const LOOKS: { look: RinLook; label: string }[] = [
  { look: "classic", label: "これまでの絵" },
  { look: "live", label: "動く絵" },
];

// 試用のときに、これまでの絵と動く絵を本人に見てもらい、話す画面で使う絵を決める
export function RinCompare() {
  const chosen = useRinLook();
  const [mood, setMood] = useState<RinMood>("waiting");
  const [still, setStill] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center gap-6 px-4 py-6">
      <nav className="flex w-full justify-between text-lg text-zinc-500 underline">
        <Link href="/">話す画面</Link>
        <Link href="/family">家族の登録</Link>
      </nav>
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {LOOKS.map(({ look, label }) => (
          <section key={look} className="flex flex-col items-center gap-4 rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-bold">{label}</h2>
            <Rin mood={mood} size={290} look={look} still={still} />
            <button
              type="button"
              onClick={() => setRinLook(look)}
              aria-pressed={chosen === look}
              className={`w-full rounded-2xl px-4 py-3 text-xl font-bold ${
                chosen === look ? "bg-sky-700 text-white" : "bg-zinc-100 text-zinc-800"
              }`}
            >
              {chosen === look ? "話す画面で使っています" : "話す画面で使う"}
            </button>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {RIN_MOODS.map(({ mood: m, label }) => (
          <button
            key={m}
            type="button"
            onClick={() => setMood(m)}
            aria-pressed={mood === m}
            className={`rounded-2xl px-6 py-3 text-xl ${mood === m ? "bg-amber-600 text-white" : "bg-zinc-100"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setStill((s) => !s)}
          aria-pressed={still}
          className={`rounded-2xl px-6 py-3 text-xl ${still ? "bg-amber-600 text-white" : "bg-zinc-100"}`}
        >
          写真を見せている
        </button>
      </div>
    </main>
  );
}
