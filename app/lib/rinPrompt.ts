"use client";

import type { Entry, Settings } from "./familyStore";

// リンちゃんから話しかけるきっかけ。デイサービスの帰宅後の声かけを優先し、なければ思い出の話題
export type RinPrompt = {
  key: string;
  // 試用の記録に残す名前
  label: string;
  // カードに出す言葉
  title: string;
  // 押したときにリンちゃんが話す言葉
  text: string;
  entry?: Entry;
};

const GREETED_KEY = "rin-dayservice-greeted";
const MEMORY_USE_KEY = "rin-memory-used";

const today = (now: Date) => now.toLocaleDateString("sv-SE");

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function pickRinPrompt(
  settings: Settings | null,
  entries: Entry[],
  now: Date,
  idle: boolean,
): RinPrompt | null {
  if (!settings) return null;
  const name = settings.userCallName ? `${settings.userCallName}、` : "";

  const ds = settings.dayService;
  const hhmm = now.toTimeString().slice(0, 5);
  if (
    ds &&
    ds.weekdays.includes(now.getDay()) &&
    hhmm >= ds.returnTime &&
    read(GREETED_KEY, "") !== today(now)
  ) {
    const place = ds.placeName || "デイサービス";
    return {
      key: "dayservice",
      label: "デイサービスの声かけ",
      title: "おかえりなさい",
      text: `おかえりなさい、${name}今日は${place}の日でしたね。どうでしたか。`,
      entry: entries.find((e) => e.kind === "場所" && e.name === place),
    };
  }

  // 思い出の話題は、しばらく会話がないときだけ出す(話の途中で割り込まない)
  const memories = (settings.memories ?? []).filter((m) => m.title);
  if (!idle || memories.length === 0) return null;
  const used = read<Record<string, number>>(MEMORY_USE_KEY, {});
  const memory = [...memories].sort((a, b) => (used[a.title] ?? 0) - (used[b.title] ?? 0))[0];
  return {
    key: `memory:${memory.title}`,
    label: `思い出「${memory.title}」`,
    title: `${memory.title}のお話`,
    text: `${name}${memory.title}のお話、聞かせてくれませんか。`,
  };
}

export function markRinPromptUsed(prompt: RinPrompt, now: Date) {
  try {
    if (prompt.key === "dayservice") {
      localStorage.setItem(GREETED_KEY, JSON.stringify(today(now)));
    } else {
      const title = prompt.key.slice("memory:".length);
      const used = read<Record<string, number>>(MEMORY_USE_KEY, {});
      localStorage.setItem(MEMORY_USE_KEY, JSON.stringify({ ...used, [title]: (used[title] ?? 0) + 1 }));
    }
  } catch {}
}
