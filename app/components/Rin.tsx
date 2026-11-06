"use client";

import { useRinLook } from "../lib/rinLook";
import { RinLive } from "./RinLive";

export type RinMood = "waiting" | "listening" | "speaking";

const MOODS: { mood: RinMood; label: string }[] = [
  { mood: "waiting", label: "待っている" },
  { mood: "listening", label: "聞いている" },
  { mood: "speaking", label: "話している" },
];

// これまでの絵は3枚を重ねて置き、表示中の1枚だけ不透明にする(切り替えのたびに読み込み待ちが出ないように)
export function Rin({
  mood,
  size = 280,
  still = false,
  look,
}: {
  mood: RinMood;
  size?: number;
  // 写真や大きな文字を見せている間は動きを止める
  still?: boolean;
  // 見比べの画面で絵を指定する。ふだんは家族が選んだ絵
  look?: "classic" | "live";
}) {
  const chosen = useRinLook();
  const live = (look ?? chosen) === "live";
  return (
    <div
      className="relative"
      style={{ width: size, height: (size * 248) / 280 }}
      role="img"
      aria-label={`リンちゃん(${MOODS.find((m) => m.mood === mood)?.label})`}
    >
      {live ? <RinLive mood={mood} size={size} still={still} /> : MOODS.map(({ mood: m }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={m}
          src={`/rin_${m}.svg`}
          alt=""
          draggable={false}
          // 画像自体はタッチを受けない(iPad の長押しで画像のプレビューが出て、外側の長押しを横取りするため)
          className={`pointer-events-none absolute inset-0 h-full w-full select-none transition-opacity duration-300 [-webkit-touch-callout:none] ${
            m === mood ? "opacity-100" : "opacity-0"
          } ${m === "speaking" && mood === "speaking" ? "animate-rin-talk" : ""}`}
        />
      ))}
    </div>
  );
}

export const RIN_MOODS = MOODS;
