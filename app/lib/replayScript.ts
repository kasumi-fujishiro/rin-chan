import type { TrialEntry } from "./trialLog";

// 再現モードの台本。デモ動画のために、話す画面の流れをそのまま再生する。
// 実際の Claude には送らず、書いてある通りに読み上げるだけ
export type ReplayStep =
  | { type: "user"; text: string }
  | {
      type: "rin";
      text: string;
      photo?: string;
      spot?: { room: string; x: number; y: number };
      relayBig?: string;
      big?: boolean;
      slow?: number;
    }
  | { type: "pick"; candidates: string[]; chosen: string }
  | { type: "message"; from: string; text: string }
  | { type: "note"; title: string; text: string };

export type ReplayScene = { title: string; steps: ReplayStep[] };
export type ReplayScript = { callName: string; scenes: ReplayScene[] };

// 台本の写真の名前と、架空のイラスト
export const REPLAY_PHOTOS: Record<string, string> = {
  眼鏡: "/replay/glasses.svg",
  つまようじ: "/replay/toothpick.svg",
  爪切り: "/replay/nailclipper.svg",
  綿棒: "/replay/cottonswab.svg",
  居間: "/replay/room.svg",
};

export function parseScript(text: string): ReplayScript {
  const data = JSON.parse(text) as ReplayScript;
  if (!Array.isArray(data?.scenes) || data.scenes.some((s) => !Array.isArray(s?.steps))) {
    throw new Error("台本の形がちがいます");
  }
  return { callName: data.callName ?? "", scenes: data.scenes };
}

// 試用の記録を台本にする。呼び名と人の名前は架空のものに置き換えるが、
// 話の中身までは直せないので、公開する前に必ず家族が読んで直す
export function logToScript(
  log: TrialEntry[],
  names: { userCallName?: string; familyCallName?: string; people?: string[] },
): ReplayScript {
  const pairs: [string, string][] = [
    [names.userCallName ?? "", "ハルさん"],
    [names.familyCallName ?? "", "お母さん"],
    ...(names.people ?? []).map((p): [string, string] => [p, "ご家族"]),
  ];
  const clean = (t: string) => pairs.reduce((s, [a, b]) => (a ? s.replaceAll(a, b) : s), t);
  const steps: ReplayStep[] = [];
  let lastPicked = "";
  for (const e of log) {
    // テレビの声や「(伝言を押した)」のような印は、会話ではないので再生しない
    if (e.ignored || e.heard.startsWith("(")) continue;
    if (e.pick) {
      if (!e.pick.chosen) continue;
      steps.push({ type: "user", text: clean(e.heard) });
      steps.push({ type: "pick", candidates: e.pick.candidates.map(clean), chosen: clean(e.pick.chosen) });
      lastPicked = e.heard;
      continue;
    }
    // 写真で選んだあとの返事は、同じ言葉をもう一度話したことにしない
    if (e.heard !== lastPicked) steps.push({ type: "user", text: clean(e.heard) });
    lastPicked = "";
    if (!e.reply.startsWith("(")) {
      steps.push({ type: "rin", text: clean(e.reply), big: e.reask >= 2, slow: e.reask >= 1 ? 0.88 : 1 });
    }
  }
  return { callName: "ハルさん", scenes: [{ title: "試用の記録から", steps }] };
}
