"use client";

import type { Spot } from "../lib/familyStore";
import { usePhotoUrl } from "../lib/usePhotoUrl";

// 部屋の写真の上に、物の置き場所を丸で示す。onPick があれば、押したところを置き場所にする
export function SpotPhoto({
  room,
  spot,
  onPick,
  className = "",
}: {
  room: Blob;
  spot?: Pick<Spot, "x" | "y">;
  onPick?: (x: number, y: number) => void;
  className?: string;
}) {
  const url = usePhotoUrl(room);
  if (!url) return null;
  return (
    <div
      className={`relative inline-block w-fit max-w-full select-none ${onPick ? "cursor-crosshair" : ""} ${className}`}
      onClick={(e) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        className="block h-full max-h-[inherit] w-auto rounded-3xl object-contain"
      />
      {spot && (
        <span
          aria-hidden
          className="pointer-events-none absolute aspect-square h-[30%] w-auto -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-[10px] border-rose-500 shadow-[0_0_0_5px_white,inset_0_0_0_5px_white]"
          style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
        />
      )}
    </div>
  );
}
