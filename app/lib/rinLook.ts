"use client";

import { useSyncExternalStore } from "react";

// 話す画面で使うリンちゃんの絵。試用で見比べて決めるまでは、これまでの絵のまま
export type RinLook = "classic" | "live";

const KEY = "rin-look-v1";
const listeners = new Set<() => void>();

function read(): RinLook {
  try {
    return localStorage.getItem(KEY) === "live" ? "live" : "classic";
  } catch {
    return "classic";
  }
}

export function setRinLook(look: RinLook) {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // 保存できない端末では、これまでの絵のまま
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useRinLook = () => useSyncExternalStore(subscribe, read, () => "classic" as RinLook);
