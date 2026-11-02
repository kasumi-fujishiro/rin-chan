"use client";

import { useEffect, useState } from "react";

// IndexedDB の写真(Blob)を <img> で表示できる URL にする。使い終わったら解放する
export function usePhotoUrl(photo?: Blob) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [photo]);
  return url;
}
