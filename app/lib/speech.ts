"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Safari は webkitSpeechRecognition だけを持つ。型は最小限だけ自前で定義する
type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecognitionErrorEvent = { error: string; message?: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed":
    "マイクが許可されていません。Safari の設定で、このサイトのマイクを「許可」にしてください。",
  "service-not-allowed":
    "音声認識が使えません。iPad の「設定 > 一般 > キーボード > 音声入力」と「Siri」をオンにしてみてください。",
  "no-speech": "声が聞こえませんでした。もう一度ボタンを押して話してください。",
  "audio-capture": "マイクが見つかりません。",
  network: "ネットにつながっていないか、音声認識のサーバーに届きませんでした。",
  aborted: "聞き取りを止めました。",
};

export type EnvInfo = {
  userAgent: string;
  device: string;
  osVersion: string | null;
  safariVersion: string | null;
  isSecure: boolean;
  hasRecognition: boolean;
  hasSynthesis: boolean;
};

export function detectEnv(): EnvInfo {
  const ua = navigator.userAgent;
  // iPadOS 13 以降の Safari は Mac のふりをするので、タッチ点数で見分ける
  const isIPad =
    /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isIPhone = /iPhone/.test(ua);
  const os = ua.match(/OS (\d+)_(\d+)(?:_(\d+))?/);
  const safari = ua.match(/Version\/([\d.]+)/);
  return {
    userAgent: ua,
    device: isIPad ? "iPad" : isIPhone ? "iPhone" : "その他(Mac / PC など)",
    // デスクトップ表示の iPad では OS 番号が出ないので、Safari の番号で代用する
    osVersion: os && !/Macintosh/.test(ua) ? `${os[1]}.${os[2]}${os[3] ? "." + os[3] : ""}` : null,
    safariVersion: safari ? safari[1] : null,
    isSecure: window.isSecureContext,
    hasRecognition: getRecognitionCtor() !== null,
    hasSynthesis: "speechSynthesis" in window,
  };
}

export function useRecognition(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("このブラウザは音声認識に対応していません。");
      return;
    }
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => {
      setError(null);
      setInterim("");
      setListening(true);
    };
    rec.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      setInterim(text);
      if (final) onFinalRef.current(text);
    };
    rec.onerror = (e) => {
      setError(RECOGNITION_ERRORS[e.error] ?? `エラー:${e.error}`);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      setError(`開始できませんでした:${String(err)}`);
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { listening, interim, error, start, stop };
}

export function useJapaneseVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () =>
      setVoices(speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ja")));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(
    (text: string, opts: { voice?: SpeechSynthesisVoice; rate?: number } = {}) => {
      if (!("speechSynthesis" in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      if (opts.voice) u.voice = opts.voice;
      u.rate = opts.rate ?? 0.8;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      speechSynthesis.speak(u);
    },
    [],
  );

  const cancel = useCallback(() => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  // iOS はタップの中で一度読み上げないと、あとからの読み上げが鳴らないことがある
  const unlocked = useRef(false);
  const unlock = useCallback(() => {
    if (unlocked.current || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    unlocked.current = true;
  }, []);

  return { speaking, speak, cancel, unlock };
}
