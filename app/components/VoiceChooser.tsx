"use client";

import { useState } from "react";
import { DEFAULT_VOICE, type VoiceSetting } from "../lib/familyStore";
import { useJapaneseVoices, useSpeaker } from "../lib/speech";

// リンちゃんの声を、iPad に入っている日本語の声から聞き比べて選ぶ
export function VoiceChooser({
  initial,
  userCallName,
  onSave,
}: {
  initial?: VoiceSetting;
  userCallName: string;
  onSave: (voice: VoiceSetting) => Promise<void>;
}) {
  const voices = useJapaneseVoices();
  const speaker = useSpeaker();
  const [setting, setSetting] = useState<VoiceSetting>(initial ?? DEFAULT_VOICE);
  const [sample, setSample] = useState(
    `${userCallName ? `${userCallName}、` : ""}眼鏡は、居間のテーブルの上にありますよ。`,
  );
  const [saved, setSaved] = useState(false);
  // 何も選んでいないときは、iPad の既定の声(一覧の最初)を使う
  const current = voices.find((v) => v.name === setting.name) ?? voices[0];

  const change = (patch: Partial<VoiceSetting>) => {
    setSetting((s) => ({ ...s, ...patch }));
    setSaved(false);
  };
  const play = (voice?: SpeechSynthesisVoice) => {
    speaker.unlock();
    speaker.speak(sample, { voice, rate: setting.rate, pitch: setting.pitch });
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow">
      <h2 className="text-2xl font-bold">リンちゃんの声</h2>
      <p className="text-lg text-zinc-600">
        ご本人がいちばん聞き取りやすい声・速さ・高さを、聞き比べて選んでください。話す画面のリンちゃんは、ここで選んだ声で話します(聞き返されたときは、さらにゆっくりになります)。
      </p>

      <label className="flex flex-col gap-1 text-lg">
        試す言葉
        <input
          className="w-full rounded-xl border-2 p-3 text-xl"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
        />
      </label>

      <ul className="grid gap-2">
        {voices.map((v) => {
          const chosen = current?.voiceURI === v.voiceURI;
          return (
            <li
              key={v.voiceURI}
              className={`flex flex-wrap items-center gap-3 rounded-2xl p-3 text-lg ${chosen ? "bg-amber-100" : "bg-amber-50"}`}
            >
              <button type="button" onClick={() => play(v)} className="rounded-xl bg-white px-4 py-2 shadow">
                ▶ 試す
              </button>
              <span className="flex-1">
                {v.name}
                {!v.localService && <span className="ml-2 text-base text-zinc-500">(ネットが必要)</span>}
              </span>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => change({ name: v.name })}
                className={`rounded-xl px-4 py-2 ${chosen ? "bg-amber-600 text-white" : "bg-zinc-200"}`}
              >
                {chosen ? "選んでいます" : "この声を選ぶ"}
              </button>
            </li>
          );
        })}
        {voices.length === 0 && <p className="text-lg text-zinc-500">日本語の声が見つかりません。</p>}
      </ul>

      <label className="flex flex-col gap-1 text-lg">
        速さ:{setting.rate.toFixed(2)}(1.00 がふつう。小さいほどゆっくり)
        <input
          type="range"
          min={0.5}
          max={1.1}
          step={0.05}
          value={setting.rate}
          onChange={(e) => change({ rate: Number(e.target.value) })}
          className="h-10"
        />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        高さ:{setting.pitch.toFixed(2)}(1.00 がふつう。高齢の方には少し低めが聞き取りやすいことがあります)
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.05}
          value={setting.pitch}
          onChange={(e) => change({ pitch: Number(e.target.value) })}
          className="h-10"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => play(current)}
          className="rounded-2xl bg-amber-100 px-5 py-4 text-xl"
        >
          ▶ 選んだ声で試す
        </button>
        <button
          type="button"
          onClick={async () => {
            await onSave({ ...setting, name: current?.name ?? "" });
            setSaved(true);
          }}
          className="flex-1 rounded-2xl bg-amber-600 py-4 text-2xl text-white"
        >
          {saved ? "保存しました" : "この声にする"}
        </button>
      </div>

      <details className="rounded-2xl bg-sky-50 p-4 text-lg">
        <summary className="cursor-pointer font-bold">iPad に声を増やすには</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          <li>iPad の「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」→「日本語」を開く</li>
          <li>
            「Kyoko(拡張)」「Otoya(拡張)」など、名前に「拡張」や「高品質」がある声を選んでダウンロードする(数百MBあるので
            Wi-Fi で)
          </li>
          <li>
            ダウンロードが終わったら、Safari でこのページを再読み込みする。一覧に増えた声を試してください
          </li>
        </ol>
        <p className="mt-2 text-base text-zinc-600">Siri の声は、Safari からは使えないことがあります。</p>
      </details>
    </section>
  );
}
