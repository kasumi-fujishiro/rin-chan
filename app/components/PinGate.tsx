"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// 本人がうっかり設定を変えないための鍵。暗号ではなく、触らないための目隠し
const PIN_KEY = "rin-family-pin";
const UNLOCK_KEY = "rin-family-unlocked";

async function hash(pin: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rin:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const read = (s: Storage, k: string) => {
  try {
    return s.getItem(k);
  } catch {
    return null;
  }
};

export function PinGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "create" | "enter" | "open">("loading");
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // 保存場所はブラウザでしか読めないので、描画後に判定する
    const next = read(sessionStorage, UNLOCK_KEY) ? "open" : read(localStorage, PIN_KEY) ? "enter" : "create";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(next);
  }, []);

  const submit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setMessage("数字4けたで入れてください");
      return;
    }
    if (state === "create") {
      if (!first) {
        setFirst(pin);
        setPin("");
        setMessage("確認のため、もう一度入れてください");
        return;
      }
      if (first !== pin) {
        setFirst(null);
        setPin("");
        setMessage("一致しませんでした。はじめからお願いします");
        return;
      }
      localStorage.setItem(PIN_KEY, await hash(pin));
    } else if ((await hash(pin)) !== read(localStorage, PIN_KEY)) {
      setPin("");
      setMessage("番号がちがいます");
      return;
    }
    sessionStorage.setItem(UNLOCK_KEY, "1");
    setState("open");
  };

  if (state === "open") return <>{children}</>;
  if (state === "loading") return null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold">ご家族の方へ</h1>
      <p className="text-xl">
        {state === "create"
          ? "はじめに、この画面を開くための数字4けたを決めてください。"
          : "数字4けたを入れてください。"}
      </p>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="rounded-2xl border-2 p-4 text-center text-4xl tracking-[0.5em]"
        autoFocus
      />
      {message && <p className="text-xl text-rose-700">{message}</p>}
      <button type="button" onClick={submit} className="rounded-2xl bg-amber-600 py-4 text-2xl text-white">
        {state === "create" && !first ? "次へ" : "ひらく"}
      </button>
      <Link href="/" className="text-center text-xl text-zinc-500 underline">
        話す画面にもどる
      </Link>
    </main>
  );
}
