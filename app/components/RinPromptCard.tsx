"use client";

import type { RinPrompt } from "../lib/rinPrompt";
import { usePhotoUrl } from "../lib/usePhotoUrl";
import { Rin } from "./Rin";

// リンちゃんからの話しかけ。iPad は押さないと声を出せないので、押したら話す
export function RinPromptCard({ prompt, onTap }: { prompt: RinPrompt; onTap: () => void }) {
  const photo = usePhotoUrl(prompt.entry?.photo);
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full max-w-xl items-center gap-4 rounded-3xl border-4 border-sky-200 bg-sky-50 p-4 text-left shadow active:scale-95"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-24 w-24 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="pointer-events-none flex h-24 w-24 shrink-0 items-center">
          <Rin mood="speaking" size={96} still />
        </span>
      )}
      <span className="flex flex-col">
        <span className="text-xl text-sky-800">リンちゃんから</span>
        <span className="text-3xl font-bold">{prompt.title}</span>
        <span className="text-2xl text-sky-800">おしてください ▶</span>
      </span>
    </button>
  );
}
