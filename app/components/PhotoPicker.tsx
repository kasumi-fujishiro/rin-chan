"use client";

import type { Entry } from "../lib/familyStore";
import { KINDS, type Kind } from "../lib/types";
import { usePhotoUrl } from "../lib/usePhotoUrl";

export type PickState =
  | { stage: "kind"; heard: string }
  // byKind:本人が3つのボタンで種類を選んだあとか(違ったときに、ボタンに戻るか終えるかを決める)
  | { stage: "photos"; heard: string; kind: Kind | "不明"; candidates: Entry[]; byKind: boolean };

// 「あれ」と言われたときに出す画面。大きな3つのボタンか、候補の写真2〜3枚
export function PhotoPicker({
  pick,
  busy,
  chosen,
  onKind,
  onChoose,
  onNone,
}: {
  pick: PickState;
  busy: boolean;
  // 再現モードで、本人が押した写真を見せる
  chosen?: string;
  onKind: (kind: Kind) => void;
  onChoose: (entry: Entry) => void;
  onNone: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      {pick.stage === "kind" ? (
        <>
          <p className="text-center text-5xl font-bold">どれのことですか?</p>
          <div className="grid w-full grid-cols-3 gap-4">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => onKind(k)}
                className="h-48 rounded-3xl bg-amber-100 text-6xl font-bold shadow active:scale-95 disabled:opacity-50"
              >
                {k}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-center text-5xl font-bold">これですか?</p>
          {/* 画面に収まるよう、枚数に応じて横幅を決める(「ちがう」ボタンが押し出されないように) */}
          <div
            className={`grid w-full gap-4 ${
              pick.candidates.length === 1
                ? "max-w-xs grid-cols-1"
                : pick.candidates.length === 2
                  ? "max-w-2xl grid-cols-2"
                  : "grid-cols-3"
            }`}
          >
            {pick.candidates.map((e) => (
              <Candidate key={e.id} entry={e} selected={e.name === chosen} onClick={() => onChoose(e)} />
            ))}
          </div>
        </>
      )}
      <button type="button" onClick={onNone} className="rounded-full bg-zinc-200 px-10 py-5 text-3xl active:scale-95">
        {pick.stage === "kind" ? "やめる" : "ちがう"}
      </button>
    </div>
  );
}

function Candidate({
  entry,
  selected,
  onClick,
}: {
  entry: Entry;
  selected?: boolean;
  onClick: () => void;
}) {
  const url = usePhotoUrl(entry.photo);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-3 rounded-3xl bg-white p-3 shadow-lg active:scale-95 ${
        selected ? "scale-95 ring-8 ring-amber-500" : ""
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="aspect-square w-full rounded-2xl object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-amber-50 text-4xl font-bold">
          {entry.name}
        </div>
      )}
      <span className="text-3xl font-bold">{entry.name}</span>
    </button>
  );
}
