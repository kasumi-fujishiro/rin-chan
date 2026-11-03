"use client";

import { useState } from "react";
import type { DayService, Entry, Settings } from "../lib/familyStore";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const field = "w-full rounded-xl border-2 p-3 text-xl";

// 思い出の話題と、デイサービスの日。リンちゃんから話しかけるきっかけにする
export function MemoriesEditor({
  settings,
  entries,
  onSave,
}: {
  settings: Settings;
  entries: Entry[];
  onSave: (patch: Pick<Settings, "memories" | "dayService">) => Promise<void>;
}) {
  const [memories, setMemories] = useState(settings.memories ?? []);
  const [dayService, setDayService] = useState<DayService>(
    settings.dayService ?? { weekdays: [], returnTime: "16:00", placeName: "デイサービス" },
  );
  const [saved, setSaved] = useState(false);
  const places = entries.filter((e) => e.kind === "場所").map((e) => e.name);

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setSaved(false);
    };
  const changeMemories = change(setMemories);
  const changeDayService = change(setDayService);

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow">
      <h2 className="text-2xl font-bold">思い出の話題・デイサービスの日</h2>

      <h3 className="text-xl font-bold">思い出の話題</h3>
      <p className="text-lg text-zinc-600">
        ご本人がうれしそうに話す思い出を書いてください。リンちゃんが「〇〇のお話、聞かせてくれませんか?」と会話のきっかけにします。書いたこと以上の事実は足しません。
      </p>
      {memories.map((m, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-3">
          <input
            className={field}
            value={m.title}
            placeholder="話題の名前(例:若いころの仕事)"
            onChange={(e) =>
              changeMemories(memories.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
            }
          />
          <textarea
            className={field}
            rows={3}
            value={m.note}
            placeholder="どんなお話か(例:駅前の文房具屋さんで20年働いていた)"
            onChange={(e) =>
              changeMemories(memories.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
            }
          />
          <button
            type="button"
            className="self-start rounded-xl bg-zinc-200 px-4 py-2 text-lg"
            onClick={() => changeMemories(memories.filter((_, j) => j !== i))}
          >
            この話題を消す
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded-xl bg-amber-100 px-4 py-3 text-lg"
        onClick={() => changeMemories([...memories, { title: "", note: "" }])}
      >
        + 話題を足す
      </button>

      <h3 className="mt-2 text-xl font-bold">デイサービスの日</h3>
      <p className="text-lg text-zinc-600">
        行く曜日と帰ってくる時間を入れると、その日の帰宅後に、リンちゃんが「おかえりなさい」と話しかけます(1日1回)。
      </p>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((label, day) => {
          const on = dayService.weekdays.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() =>
                changeDayService({
                  ...dayService,
                  weekdays: on
                    ? dayService.weekdays.filter((d) => d !== day)
                    : [...dayService.weekdays, day].sort(),
                })
              }
              className={`h-14 w-14 rounded-full text-xl ${on ? "bg-amber-600 text-white" : "bg-amber-100"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1 text-lg">
        帰ってくる時間(このあとに声をかけます)
        <input
          type="time"
          className={field}
          value={dayService.returnTime}
          onChange={(e) => changeDayService({ ...dayService, returnTime: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        ご本人から見た呼び方(「場所」に同じ名前で写真を登録すると、その写真を見せます)
        <input
          className={field}
          list="place-names"
          value={dayService.placeName}
          onChange={(e) => changeDayService({ ...dayService, placeName: e.target.value })}
        />
        <datalist id="place-names">
          {places.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>

      <button
        type="button"
        className="rounded-2xl bg-amber-600 py-4 text-2xl text-white"
        onClick={async () => {
          await onSave({
            memories: memories
              .filter((m) => m.title.trim())
              .map((m) => ({ title: m.title.trim(), note: m.note.trim() })),
            dayService,
          });
          setSaved(true);
        }}
      >
        {saved ? "保存しました" : "話題とデイサービスの日を保存"}
      </button>
    </section>
  );
}
