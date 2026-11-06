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
  addEventListener(type: string, fn: () => void): void;
};
type RecognitionCtor = new () => Recognition;

// iPad で聞き取りが止まる原因を調べるための記録(/check に表示する)
export const speechLog: string[] = [];
export function logSpeech(message: string) {
  const t =
    new Date().toLocaleTimeString("ja-JP", { hour12: false }) +
    "." +
    String(Date.now() % 1000).padStart(3, "0");
  speechLog.unshift(`${t} ${message}`);
  speechLog.length = Math.min(speechLog.length, 60);
  window.dispatchEvent(new Event("rin-speech-log"));
}

// このページでマイクが一度でも動いたか。iPad では、マイクを一度も使っていない状態で声を再生すると、
// そのあとのマイクは印が出ても音が入らない(一度使ったあとの再生なら、すぐ聞き取れる)
let micWarmed = false;
export const isMicWarm = () => micWarmed;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed": "マイクが許可されていません。Safari の設定で、このサイトのマイクを「許可」にしてください。",
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
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
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

  // やり直しのときに自分自身を呼ぶための参照
  const beginRef = useRef<(retry: boolean, long?: boolean, persist?: boolean) => void>(() => {});
  // 止めるように言われたあとは、聞き直さない
  const stoppedRef = useRef(false);
  // long:間があいても止めず、しばらく黙ったら終える(家族の言葉が途中で切れていたため)
  // persist:すぐに終わってしまったら、1回だけ聞き直す(声の伝言のあとは iPad に断られることがあるため)
  const begin = useCallback((retry: boolean, long = false, persist = false) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("このブラウザは音声認識に対応していません。");
      return;
    }
    stoppedRef.current = false;
    // 前の聞き取りを止める。止めた側の通知が新しい聞き取りを消さないよう、各ハンドラで自分か確かめる
    const prev = recRef.current;
    recRef.current = null;
    prev?.abort();
    const rec = new Ctor();
    const startedAt = Date.now();
    rec.lang = "ja-JP";
    rec.continuous = long;
    rec.interimResults = true;
    // long のときは、確定した言葉をためておき、終わったときにまとめて渡す
    let finalText = "";
    let silence: ReturnType<typeof setTimeout> | undefined;
    const SILENCE_MS = 2500;
    const MAX_MS = 20000;
    const maxTimer = long ? setTimeout(() => rec.stop(), MAX_MS) : undefined;
    let gotResult = false;
    // いつまでも始まらないときは手放す(「聞いている」のまま押せなくならないように)
    const noStart = setTimeout(() => {
      if (recRef.current !== rec) return;
      logSpeech("始まらないので手放す");
      recRef.current = null;
      rec.abort();
      setListening(false);
    }, 6000);
    const since = () => `+${Date.now() - startedAt}ms`;
    logSpeech(
      `start${retry ? "(やり直し)" : ""} 読み上げ中=${"speechSynthesis" in window && speechSynthesis.speaking}`,
    );
    for (const type of [
      "audiostart",
      "soundstart",
      "speechstart",
      "speechend",
      "soundend",
      "audioend",
      "nomatch",
    ]) {
      rec.addEventListener(type, () => logSpeech(`${type} ${since()}`));
    }
    rec.onstart = () => {
      logSpeech(`onstart ${since()}`);
      clearTimeout(noStart);
      micWarmed = true;
      if (recRef.current !== rec) return;
      setError(null);
      setInterim("");
      setListening(true);
    };
    rec.onresult = (e) => {
      if (recRef.current !== rec) return;
      gotResult = true;
      if (long) {
        let fin = "";
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) fin += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        finalText = fin;
        setInterim(fin + interim);
        clearTimeout(silence);
        silence = setTimeout(() => rec.stop(), SILENCE_MS);
        return;
      }
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
      logSpeech(`error=${e.error} ${e.message ?? ""} ${since()}${recRef.current !== rec ? "(古い)" : ""}`);
      if (recRef.current !== rec) return;
      // iOS は始めた直後に止められることがある(読み上げや別のタブとマイクを取り合うとき)。1回だけやり直す
      if (e.error === "aborted" && !retry && Date.now() - startedAt < 2000) {
        recRef.current = null;
        setTimeout(() => beginRef.current(true, long, persist), 400);
        return;
      }
      setError(RECOGNITION_ERRORS[e.error] ?? `エラー:${e.error}`);
    };
    rec.onend = () => {
      logSpeech(`end ${since()}${recRef.current !== rec ? "(古い)" : ""}`);
      clearTimeout(silence);
      clearTimeout(maxTimer);
      clearTimeout(noStart);
      if (recRef.current !== rec) return;
      if (long && finalText.trim()) onFinalRef.current(finalText.trim());
      if (persist && !retry && !gotResult && !stoppedRef.current && Date.now() - startedAt < 2000) {
        recRef.current = null;
        setTimeout(() => {
          if (!stoppedRef.current) beginRef.current(true, long, persist);
        }, 400);
        return;
      }
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      logSpeech(`start例外 ${String(err)}`);
      clearTimeout(noStart);
      setError(`開始できませんでした:${String(err)}`);
    }
  }, []);

  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(
    (opts: { long?: boolean; persist?: boolean } = {}) => {
      setError(null);
      // 読み上げ中だった場合は止めて、少し待ってからマイクを使う(iOS で取り合いにならないように)
      if ("speechSynthesis" in window && (speechSynthesis.speaking || speechSynthesis.pending)) {
        speechSynthesis.cancel();
        setTimeout(() => begin(false, opts.long, opts.persist), 300);
      } else {
        begin(false, opts.long, opts.persist);
      }
    },
    [begin],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    const rec = recRef.current;
    rec?.stop();
    // 止める合図に iPad が答えないときも、必ず止まった画面に戻す
    setTimeout(() => {
      if (recRef.current !== rec) return;
      logSpeech("止まらないので手放す");
      recRef.current = null;
      rec?.abort();
      setListening(false);
    }, 1000);
  }, []);

  // 声を再生する前に、マイクを一度だけ短く動かす。聞いた言葉は使わない
  const warm = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const Ctor = getRecognitionCtor();
        if (!Ctor || micWarmed || recRef.current) {
          resolve();
          return;
        }
        const rec = new Ctor();
        rec.lang = "ja-JP";
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(limit);
          logSpeech("マイクの準備おわり");
          setTimeout(resolve, 300);
        };
        const limit = setTimeout(() => {
          rec.abort();
          finish();
        }, 2500);
        rec.onstart = () => {
          micWarmed = true;
          setTimeout(() => rec.stop(), 500);
        };
        rec.onerror = (e) => logSpeech(`マイクの準備 error=${e.error}`);
        rec.onend = finish;
        logSpeech("マイクの準備");
        try {
          rec.start();
        } catch {
          finish();
        }
      }),
    [],
  );

  // 呼びかけモード:画面を「聞いている」にせず、まわりの声を聞き続ける。
  // 言葉のまとまりごとに onHeard へ渡す。ふつうの聞き取りが始まると、begin がこちらを止める
  const [wakeLive, setWakeLive] = useState(false);
  const wakeRecRef = useRef<Recognition | null>(null);
  const wake = useCallback((onHeard: (text: string) => void, onEnd: (quick: boolean) => void) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    const startedAt = Date.now();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    // 長く聞き続けると言葉がたまり続けるので、ときどき聞き直す
    const refresh = setTimeout(() => rec.stop(), 55_000);
    const SETTLE_MS = 900;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let base = 0;
    let text = "";
    const flush = () => {
      const heard = text.trim();
      text = "";
      if (heard && recRef.current === rec) onHeard(heard);
    };
    rec.onstart = () => {
      logSpeech("呼びかけモード 聞き始め");
      micWarmed = true;
      if (recRef.current === rec) setWakeLive(true);
    };
    rec.onresult = (e) => {
      if (recRef.current !== rec) return;
      // 端末によっては途中で結果の並びが振り直される
      if (e.results.length < base) base = 0;
      text = "";
      for (let i = base; i < e.results.length; i++) text += e.results[i][0].transcript;
      const length = e.results.length;
      clearTimeout(settle);
      settle = setTimeout(() => {
        base = length;
        flush();
      }, SETTLE_MS);
    };
    rec.onerror = (e) => logSpeech(`呼びかけモード error=${e.error}`);
    rec.onend = () => {
      logSpeech(`呼びかけモード end +${Date.now() - startedAt}ms`);
      clearTimeout(refresh);
      clearTimeout(settle);
      flush();
      if (wakeRecRef.current === rec) {
        wakeRecRef.current = null;
        setWakeLive(false);
      }
      if (recRef.current !== rec) return;
      recRef.current = null;
      // すぐに終わるときは iPad に断られているので、間をあけてやり直す
      onEnd(Date.now() - startedAt < 1500);
    };
    recRef.current = rec;
    wakeRecRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      logSpeech(`呼びかけモード start例外 ${String(err)}`);
      clearTimeout(refresh);
      recRef.current = null;
      wakeRecRef.current = null;
      onEnd(true);
    }
  }, []);

  const stopWake = useCallback(() => {
    const rec = wakeRecRef.current;
    if (!rec) return;
    wakeRecRef.current = null;
    if (recRef.current === rec) recRef.current = null;
    rec.abort();
    setWakeLive(false);
  }, []);

  // 画面を離れたら、マイクを手放す(別のタブがマイクを持ったままにならないように)
  useEffect(() => {
    const release = () => {
      const rec = recRef.current;
      if (rec) logSpeech(`release(画面を離れた) visibility=${document.visibilityState}`);
      recRef.current = null;
      wakeRecRef.current = null;
      rec?.abort();
      setListening(false);
      setWakeLive(false);
    };
    const onHide = () => document.visibilityState === "hidden" && release();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", release);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  return { listening, interim, error, start, stop, warm, wake, stopWake, wakeLive };
}

export function useJapaneseVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ja")));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(
    (
      text: string,
      // lead:本題の前に、別に読み上げる呼びかけ(「ハルさん。」のあとに少し間があく)
      // onEnd:読み終えたとき(途中で止められたときは呼ばない)
      opts: {
        voice?: SpeechSynthesisVoice;
        rate?: number;
        pitch?: number;
        lead?: string;
        onEnd?: () => void;
      } = {},
    ) => {
      if (!("speechSynthesis" in window)) return;
      speechSynthesis.cancel();
      const make = (t: string) => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = "ja-JP";
        if (opts.voice) u.voice = opts.voice;
        u.rate = opts.rate ?? 0.8;
        u.pitch = opts.pitch ?? 1;
        return u;
      };
      const parts = opts.lead ? [make(`${opts.lead}。`), make(text)] : [make(text)];
      parts[0].onstart = () => {
        logSpeech("読み上げ開始");
        setSpeaking(true);
      };
      const last = parts[parts.length - 1];
      last.onend = () => {
        logSpeech("読み上げ終了");
        setSpeaking(false);
        opts.onEnd?.();
      };
      for (const u of parts) {
        u.onerror = (e) => {
          logSpeech(`読み上げエラー ${e.error}`);
          setSpeaking(false);
        };
        speechSynthesis.speak(u);
      }
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
    logSpeech("unlock(無音の読み上げ)");
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    unlocked.current = true;
  }, []);

  return { speaking, speak, cancel, unlock };
}
