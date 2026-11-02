"use client";

// 試用の記録。iPad の中(localStorage)にだけ残し、どこにも送らない
export type TrialEntry = {
  at: string;
  heard: string;
  reply: string;
  // 0 はふつうの会話、1〜3 は何回目の聞き返しへの返事か
  reask: number;
};

const KEY = "rin-trial-log-v1";

export function readTrialLog(): TrialEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function appendTrialLog(entry: TrialEntry) {
  try {
    const log = readTrialLog();
    log.push(entry);
    localStorage.setItem(KEY, JSON.stringify(log.slice(-500)));
  } catch {
    // 保存できなくても会話は続ける
  }
}

export function clearTrialLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// 「え?」「なに?」「もう一回」など、短い聞き返しだけを拾う。
// 「ええ」「はい」は返事なので聞き返しにしない
const REASK_WHOLE = /^(え[っー〜]?|ん[ー〜]?|なに|何|なあに|なんて|なんですか|はあ)$/;
const REASK_PHRASE = /(もう(一|いっ)(回|かい|ぺん|度)|聞こえ|きこえ|わからない|分からない|なんて言った|何て言った)/;

export function isReask(text: string): boolean {
  const t = text.replace(/[\s。、?!?!]/g, "");
  return t.length > 0 && t.length <= 15 && (REASK_WHOLE.test(t) || REASK_PHRASE.test(t));
}
