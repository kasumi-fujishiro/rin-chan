"use client";

import type Anthropic from "@anthropic-ai/sdk";

// いまの会話の流れ。再読み込みしても続くよう iPad の中(localStorage)に置く。
// 30分会話がなければ新しい会話として始める(前の話題を引きずらないように)
export type Turn = Anthropic.MessageParam & { content: string };

const KEY = "rin-conversation-v1";
export const GAP_MS = 30 * 60 * 1000;
const MAX_TURNS = 40;

type Saved = { updatedAt: number; turns: Turn[] };

function read(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function loadConversation(now = Date.now()): Turn[] {
  const saved = read();
  if (!saved || now - saved.updatedAt > GAP_MS) return [];
  return saved.turns;
}

export function saveConversation(turns: Turn[], now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ updatedAt: now, turns: turns.slice(-MAX_TURNS) }));
  } catch {
    // 保存できなくても会話は続ける
  }
}

// 前に話してから時間が空いていたら、空の会話から始める
export function freshIfStale(turns: Turn[], lastAt: number, now = Date.now()): Turn[] {
  return lastAt && now - lastAt > GAP_MS ? [] : turns;
}
