export type RinMood = "waiting" | "listening" | "speaking";

const MOODS: { mood: RinMood; label: string }[] = [
  { mood: "waiting", label: "待っている" },
  { mood: "listening", label: "聞いている" },
  { mood: "speaking", label: "話している" },
];

// 3枚を重ねて置き、表示中の1枚だけ不透明にする(切り替えのたびに読み込み待ちが出ないように)
export function Rin({ mood, size = 280 }: { mood: RinMood; size?: number }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: (size * 248) / 280 }}
      role="img"
      aria-label={`リンちゃん(${MOODS.find((m) => m.mood === mood)?.label})`}
    >
      {MOODS.map(({ mood: m }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={m}
          src={`/rin_${m}.svg`}
          alt=""
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
            m === mood ? "opacity-100" : "opacity-0"
          } ${m === "speaking" && mood === "speaking" ? "animate-rin-talk" : ""}`}
        />
      ))}
    </div>
  );
}

export const RIN_MOODS = MOODS;
