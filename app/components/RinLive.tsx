"use client";

import { useEffect, useId, useState } from "react";
import type { RinMood } from "./Rin";

// 部品に分けて動かすリンちゃん。動きは「今どうしているか」を伝えるためだけに付ける。
// - 毛は黒いまま。目のまわりと口の線だけ明るくする(黒い顔に黒い目や口だと、明暗の差が小さくて見えにくいため)
// - 動かすのは一度に一か所。写真を見せている間(still)は止める
// - 呼吸は全体を一緒に動かす。つけっぱなしの iPad でも軽いように、絵の中ではなく外側の箱を動かす
const FUR = "#2A2522";
const CREAM = "#F3E6D3";
const INK = "#120E0C";

function Eye({ cx }: { cx: number }) {
  return (
    <g className="rin-eye" style={{ "--cx": `${cx}px` } as React.CSSProperties}>
      <circle cx={cx} cy={-4} r={7} fill={INK} />
      <circle cx={cx + 2.2} cy={-6.2} r={2.6} fill="#FFFFFF" />
    </g>
  );
}

function Ear({ side }: { side: 1 | -1 }) {
  const p = (x: number, y: number) => `${x * side},${y}`;
  return (
    <g className="rin-ear" style={{ "--cx": `${20 * side}px` } as React.CSSProperties}>
      <polygon
        points={`${p(34, -16)} ${p(26, -56)} ${p(0, -32)}`}
        fill={FUR}
        stroke={FUR}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <polygon points={`${p(27, -24)} ${p(24, -44)} ${p(11, -32)}`} fill="#DDB99C" />
    </g>
  );
}

export function RinLive({ mood, size, still = false }: { mood: RinMood; size: number; still?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [blink, setBlink] = useState(false);
  const [tongue, setTongue] = useState(false);

  // まばたきは間隔をばらつかせる。話している間と写真を見せている間はしない
  useEffect(() => {
    if (still || mood === "speaking") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          next();
        }, 170);
      }, 3500 + Math.random() * 4500);
    };
    next();
    return () => {
      clearTimeout(timer);
      setBlink(false);
    };
  }, [mood, still]);

  // 待っている間に、ときどき舌を少し出す
  useEffect(() => {
    if (still || mood !== "waiting") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        setTongue(true);
        timer = setTimeout(() => {
          setTongue(false);
          next();
        }, 1800);
      }, 12000 + Math.random() * 13000);
    };
    next();
    return () => {
      clearTimeout(timer);
      setTongue(false);
    };
  }, [mood, still]);

  return (
    <div className={`h-full w-full ${still ? "" : "rin-breath"}`} style={{ width: size }}>
      <svg
        viewBox="-66 -74 140 124"
        className="pointer-events-none h-full w-full select-none overflow-visible"
        data-mood={mood}
        data-still={still || undefined}
        data-blink={blink || undefined}
        data-tongue={tongue || undefined}
        aria-hidden
      >
        <defs>
          <radialGradient id={`${id}f`} cx="40%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#4A433F" />
            <stop offset="60%" stopColor={FUR} />
            <stop offset="100%" stopColor="#1A1614" />
          </radialGradient>
          <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6A625B" />
            <stop offset="100%" stopColor="#4C4540" />
          </linearGradient>
          <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBF3E6" />
            <stop offset="100%" stopColor="#E9D6BB" />
          </linearGradient>
        </defs>

        <ellipse cx={0} cy={46.5} rx={38} ry={3.5} fill="#2B2522" opacity={0.14} />
        <path d="M-31 46 C-38 24 -24 6 0 6 C24 6 38 24 31 46 Q0 50 -31 46 Z" fill={`url(#${id}f)`} />
        <ellipse cx={0} cy={38} rx={11} ry={8} fill={`url(#${id}c)`} />

        <g className="rin-head">
          <g transform="translate(0 -12) scale(0.88)">
            <Ear side={-1} />
            <Ear side={1} />
            <ellipse cx={0} cy={0} rx={44} ry={40} fill={`url(#${id}f)`} />
            <ellipse cx={0} cy={17} rx={24} ry={17} fill={`url(#${id}m)`} />
            <circle cx={-16} cy={-4} r={9.5} fill={CREAM} />
            <circle cx={16} cy={-4} r={9.5} fill={CREAM} />
            <ellipse cx={-16} cy={-21} rx={5.5} ry={3.2} fill="#E8B673" />
            <ellipse cx={16} cy={-21} rx={5.5} ry={3.2} fill="#E8B673" />
            <Eye cx={-16} />
            <Eye cx={16} />
            <ellipse cx={0} cy={9} rx={6.5} ry={4.5} fill={INK} />
            <ellipse cx={-2} cy={7.4} rx={2} ry={1.1} fill="#8A817A" />
            <g className="rin-tongue">
              <path d="M-5 18 V24 Q-5 29.5 0 29.5 Q5 29.5 5 24 V18 Z" fill="#EE7F86" />
              <path d="M0 20 V25.5" stroke="#C95F68" strokeWidth={1.2} strokeLinecap="round" />
            </g>
            <path
              className="rin-mouth-closed"
              d="M0 13.5 V17 M-9 17 Q-4.5 23 0 17 Q4.5 23 9 17"
              fill="none"
              stroke={CREAM}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <g className="rin-mouth-open">
              <path d="M-10 16 Q0 21 10 16 Q9 34 0 34 Q-9 34 -10 16 Z" fill="#7A3434" />
              <ellipse cx={0} cy={29} rx={5.5} ry={4} fill="#F28B8B" />
            </g>
          </g>
        </g>

        <path d="M-28 15 Q0 31 28 15" fill="none" stroke="#B8855A" strokeWidth={6.5} strokeLinecap="round" />
        <circle cx={0} cy={27} r={4} fill="#E3BE7A" />

        <g className="rin-waves" fill="none" stroke="#C9781E" strokeWidth={2.5} strokeLinecap="round">
          <path d="M50 -28 Q57 -20 50 -12" />
          <path d="M58 -35 Q69 -20 58 -5" />
        </g>
      </svg>
    </div>
  );
}
