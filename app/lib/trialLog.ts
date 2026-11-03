"use client";

// 試用の記録。iPad の中(localStorage)にだけ残し、どこにも送らない
export type TrialEntry = {
  at: string;
  heard: string;
  reply: string;
  // 0 はふつうの会話、1〜3 は何回目の聞き返しへの返事か
  reask: number;
  // 「あれ」から写真で選んだとき。chosen が null なら「ちがう」「やめる」
  pick?: { kind: string; candidates: string[]; chosen: string | null };
  // 付き添いの家族があとから付ける印。リンちゃんの返事が本人に伝わったか
  understood?: boolean;
};

// 付き添いの家族が書くメモ
export type TrialMemo = { at: string; text: string };

const KEY = "rin-trial-log-v1";
const MEMO_KEY = "rin-trial-memo-v1";

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

// at(記録した時刻)で1件を探して、伝わったかの印を付け替える。同じ印をもう一度押すと外す
export function markTrialEntry(at: string, understood: boolean): TrialEntry[] {
  const log = readTrialLog().map((e) =>
    e.at === at ? { ...e, understood: e.understood === understood ? undefined : understood } : e,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {}
  return log;
}

export function readTrialMemos(): TrialMemo[] {
  try {
    return JSON.parse(localStorage.getItem(MEMO_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addTrialMemo(text: string): TrialMemo[] {
  const memos = [...readTrialMemos(), { at: new Date().toISOString(), text }];
  try {
    localStorage.setItem(MEMO_KEY, JSON.stringify(memos.slice(-300)));
  } catch {}
  return memos;
}

export function clearTrialLog() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(MEMO_KEY);
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

// 「あれ」「あの」など、言いかけの言葉。登録した写真から選んでもらうきっかけにする
const VAGUE = /(あれ|あの|ほら|なんだっけ|何だっけ|なんて言う|何て言う|なんていう|あそこ|あいつ)/;

export function isVague(text: string): boolean {
  return VAGUE.test(text.replace(/\s/g, ""));
}
