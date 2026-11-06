// 呼びかけモードで聞こえた言葉の振り分け。ここで当てはまらなかった言葉は、保存も送信もせず捨てる

const RIN_NAMES = ["リンちゃん", "りんちゃん", "リンチャン", "凛ちゃん", "鈴ちゃん", "林ちゃん", "琳ちゃん", "倫ちゃん"];

const squeeze = (text: string) => text.replace(/[\s、。,.!?!?]/g, "");

// 名前を呼ばれたら、そのあとの言葉を返す(名前だけなら空文字)。呼ばれていなければ null
export function afterCall(text: string, assistantName: string): string | null {
  const t = squeeze(text);
  for (const name of [assistantName, ...RIN_NAMES]) {
    const at = name ? t.indexOf(name) : -1;
    if (at >= 0) return t.slice(at + name.length);
  }
  return null;
}

// テレビの声で写真が出ないよう、「どこ」だけでは反応しない。
// 「あれ」のような言葉か登録した物の名前があるときと、探しているときの決まった言い方だけにする
const LOST = /どこ|見当たらない|見つからない|[がは]な(い|くなった)/;
const LOST_PHRASE = /どこ(かしら|だっけ|いった|行った|やった|に置いた|においた)/;
const POINTING = /あれ|アレ|あの|アノ/;
const MAX_LENGTH = 30;

export function isSearching(text: string, names: string[]): boolean {
  const t = squeeze(text);
  if (t.length > MAX_LENGTH || !LOST.test(t)) return false;
  return LOST_PHRASE.test(t) || POINTING.test(t) || names.some((n) => n && t.includes(n));
}
