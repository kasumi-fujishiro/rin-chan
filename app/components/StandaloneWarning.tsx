"use client";

import { useEffect, useState } from "react";

// iPad の「ホーム画面に追加」から開くと、Safari の音声認識が使えない(iOS の制限)。
// そのときは Safari で開き直すよう案内する
export function StandaloneWarning() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    // 表示モードはブラウザでしか分からないので、描画後に判定する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStandalone(nav.standalone === true || matchMedia("(display-mode: standalone)").matches);
  }, []);
  if (!standalone) return null;
  return (
    <p role="alert" className="w-full rounded-2xl bg-amber-200 p-4 text-xl">
      ホーム画面から開くと、声の聞き取りが使えません。Safari で開いてください。
    </p>
  );
}
