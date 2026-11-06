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

// 時間が空いて終わった会話を取り出す(今日のメモにまとめるため)。取り出したら消す
export function takeStaleConversation(now = Date.now()): Turn[] {
  const saved = read();
  if (!saved || now - saved.updatedAt <= GAP_MS) return [];
  clearConversation();
  return saved.turns;
}

export function clearConversation() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても、時間が空いた会話は読み込まれない
  }
}

// 今日これまでの話のメモ。30分空いて会話が区切れても、その日のうちは流れが分かるように iPad の中に残す
const TODAY_KEY = "rin-today-v1";
const dateKey = (now: number) => new Date(now).toDateString();

export function loadToday(now = Date.now()): string {
  try {
    const saved = JSON.parse(localStorage.getItem(TODAY_KEY) ?? "null") as { date: string; text: string } | null;
    return saved?.date === dateKey(now) ? saved.text : "";
  } catch {
    return "";
  }
}

export function saveToday(text: string, now = Date.now()) {
  try {
    localStorage.setItem(TODAY_KEY, JSON.stringify({ date: dateKey(now), text }));
  } catch {
    // 保存できなくても会話は続ける
  }
}

// 前に話してから時間が空いていたら、空の会話から始める
export function freshIfStale(turns: Turn[], lastAt: number, now = Date.now()): Turn[] {
  return lastAt && now - lastAt > GAP_MS ? [] : turns;
}
