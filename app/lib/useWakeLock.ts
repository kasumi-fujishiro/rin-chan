"use client";

import { useEffect } from "react";

// 置きっぱなしで使うので、画面が暗くならないようにする(iPad の Safari 16.4 以降)。
// 別のタブに移ると外れるので、戻ってきたらまた頼む
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // 使えない端末では、iPad の設定の「自動ロック」を「なし」にしてもらう
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);
}
