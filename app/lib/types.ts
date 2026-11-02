// 画面とサーバーの両方で使う型。家族の情報そのものは iPad の中にだけ保存する
export type Kind = "物" | "人" | "場所";
export const KINDS: Kind[] = ["物", "人", "場所"];

export type Word = { say: string; means: string };

export type ManualEntry = { kind: Kind; name: string; note: string };

// Claude に送る形(写真は入れない)
export type Profile = {
  assistantName: string;
  userCallName: string;
  familyCallName: string;
  words: Word[];
  manual: ManualEntry[];
};
