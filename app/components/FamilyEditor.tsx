"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  deleteEntry,
  exportBackup,
  importBackup,
  getSettings,
  listEntries,
  listMessages,
  putEntry,
  requestPersist,
  saveBackupFile,
  saveSettings,
  shrinkPhoto,
  type Entry,
  type Message,
  type Settings,
  type Spot,
} from "../lib/familyStore";
import { KINDS, type Kind } from "../lib/types";
import { usePhotoUrl } from "../lib/usePhotoUrl";
import { DictionarySuggestions } from "./DictionarySuggestions";
import { LineSettings } from "./LineSettings";
import { MemoriesEditor } from "./MemoriesEditor";
import { SpotPhoto } from "./SpotPhoto";
import { VoiceChooser } from "./VoiceChooser";
import { MessageRecorder } from "./MessageRecorder";

type PanelId = "names" | "entries" | "memories" | "messages" | "line" | "voice" | "wake" | "backup";

const KIND_HINT: Record<Kind, string> = {
  物: "例:眼鏡、電子レンジ、給湯器",
  人: "例:家族、よく会う人",
  場所: "例:部屋、よく行くお店",
};

const field = "w-full rounded-xl border-2 p-3 text-xl";
const card = "flex flex-col gap-4 rounded-3xl bg-white p-6 shadow";

export function FamilyEditor() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<Kind>("物");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [saved, setSaved] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  // バックアップから戻したら、伝言の一覧も読み直す
  const [restored, setRestored] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setSettings((await getSettings()) ?? DEFAULT_SETTINGS);
      setEntries(await listEntries());
      setLoaded(true);
      setPersisted(await requestPersist());
    })();
  }, []);

  const save = async () => {
    await saveSettings(settings);
    setSaved(true);
  };
  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  };

  const shown = entries.filter((e) => e.kind === kind);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    // 伝言の数は、伝言の画面を閉じたときにも読み直す
    if (panel === null) listMessages().then(setMessages);
  }, [panel, restored]);

  const saveMerged = async (patch: Partial<Settings>) => {
    // 呼び方の欄で編集中のものは保存しない(保存済みの内容に足す)
    const next = { ...((await getSettings()) ?? DEFAULT_SETTINGS), ...patch };
    await saveSettings(next);
    setSettings((s) => ({ ...s, ...patch }));
  };

  const count = (k: Kind) => entries.filter((e) => e.kind === k).length;
  const noSpot = entries.filter((e) => e.kind === "物" && !e.spot).length;
  const day = settings.dayService;
  const unheard = messages.filter((m) => !m.heardAt).length;
  const tiles: { id: PanelId; title: string; lines: string[]; warn?: string }[] = [
    {
      id: "names",
      title: "呼び方と言い方",
      lines: [
        `ご本人:${settings.userCallName || "(未登録)"}`,
        `頼りにしている家族:${settings.familyCallName || "(未登録)"}`,
        `ご本人の言い方:${settings.words.filter((w) => w.say).length}件`,
      ],
    },
    {
      id: "entries",
      title: "家の説明書",
      lines: [`物 ${count("物")}件・人 ${count("人")}件・場所 ${count("場所")}件`],
      warn: noSpot ? `置き場所の印がない物:${noSpot}件` : undefined,
    },
    {
      id: "memories",
      title: "思い出とデイサービス",
      lines: [
        `思い出の話題:${settings.memories?.length ?? 0}件`,
        day?.weekdays.length
          ? `${day.placeName}:${day.weekdays.map((d) => "日月火水木金土"[d]).join("・")} ${day.returnTime}ごろ帰宅`
          : "デイサービスの日:未登録",
      ],
    },
    {
      id: "messages",
      title: "家族からの伝言",
      lines: [`伝言:${messages.length}件`, unheard ? `まだ聞いていない:${unheard}件` : "すべて聞きました"],
    },
    {
      id: "line",
      title: "LINE への連絡",
      lines: [
        settings.lineKey ? "合言葉:入っています" : "合言葉:まだです",
        settings.autoReport?.enabled ? `毎日の報告:${settings.autoReport.time} に自動で送る` : "毎日の報告:自動では送らない",
        `返事の知らせ:${settings.notifyReplies === false ? "送らない" : "送る"}`,
      ],
    },
    {
      id: "voice",
      title: "リンちゃんの声",
      lines: [
        settings.voice?.name ? `声:${settings.voice.name}` : "声:iPad のふつうの声",
        `速さ ${settings.voice?.rate ?? 0.8}・高さ ${settings.voice?.pitch ?? 1}`,
      ],
    },
    {
      id: "wake",
      title: "呼びかけモード",
      lines: [settings.wakeMode ? "オン:「リンちゃん」と呼ぶと聞きます" : "オフ:ボタンを押して話します"],
    },
    {
      id: "backup",
      title: "バックアップ",
      lines: ["写真も含めて1つのファイルに保存・復元"],
      warn: persisted === false ? "Safari がデータを消すことがあります" : undefined,
    },
  ];
  const current = tiles.find((t) => t.id === panel);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">家族の登録</h1>
        <nav className="flex flex-wrap gap-4 text-lg underline">
          <Link href="/">話す画面</Link>
          <Link href="/log">試用の記録と報告</Link>
          <Link href="/check">音声の確認</Link>
          <Link href="/rin">リンちゃんの絵</Link>
        </nav>
      </header>
      <p className="text-base text-zinc-600">
        ここで登録したことは、この iPad の中にだけ保存されます。話しかけたときに文字の部分だけを返事づくりに使い、写真は送りません。
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <section key={t.id} className="flex flex-col gap-2 rounded-3xl bg-white p-5 shadow">
            <h2 className="text-xl font-bold">{t.title}</h2>
            <ul className="flex flex-1 flex-col gap-1 text-lg text-zinc-700">
              {t.lines.map((l) => (
                <li key={l} className="break-words">{l}</li>
              ))}
              {t.warn && <li className="font-bold text-rose-700">{t.warn}</li>}
            </ul>
            <button type="button" onClick={() => setPanel(t.id)}
              className="mt-2 rounded-2xl bg-amber-600 py-3 text-xl text-white">
              編集する
            </button>
          </section>
        ))}
      </div>

      {current && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-3 sm:p-6"
          role="dialog" aria-modal="true" aria-label={current.title}
          onClick={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-amber-50 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b-2 border-amber-200 bg-white px-5 py-3">
              <h2 className="text-2xl font-bold">{current.title}</h2>
              <button type="button" onClick={() => setPanel(null)} className="rounded-2xl bg-zinc-200 px-6 py-3 text-xl">
                閉じる
              </button>
            </div>
            <div className="flex flex-col gap-6 overflow-y-auto p-4">
              {panel === "names" && (
                <>
                  <section className={card}>
                    <label className="flex flex-col gap-1 text-lg">
                      ご本人の呼び名(リンちゃんがこう呼びかけます)
                      <input className={field} value={settings.userCallName} placeholder="例:おばあちゃん"
                        onChange={(e) => update({ userCallName: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1 text-lg">
                      ご本人から見た、頼りにしている家族の呼び方(「〜に聞いてみましょうね」で使います)
                      <input className={field} value={settings.familyCallName} placeholder="例:お母さん"
                        onChange={(e) => update({ familyCallName: e.target.value })} />
                    </label>

                    <h3 className="mt-2 text-xl font-bold">ご本人の言い方</h3>
                    <p className="text-lg text-zinc-600">ご本人がよく使う言い方を入れると、リンちゃんも同じ言い方をします。</p>
                    {settings.words.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input className={field} value={w.say} placeholder="ご本人の言い方"
                          onChange={(e) => update({ words: settings.words.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)) })} />
                        <span className="shrink-0 text-lg">は</span>
                        <input className={field} value={w.means} placeholder="意味"
                          onChange={(e) => update({ words: settings.words.map((x, j) => (j === i ? { ...x, means: e.target.value } : x)) })} />
                        <button type="button" aria-label="この言い方を消す" className="shrink-0 rounded-xl bg-zinc-200 px-4 py-3 text-lg"
                          onClick={() => update({ words: settings.words.filter((_, j) => j !== i) })}>
                          消す
                        </button>
                      </div>
                    ))}
                    <button type="button" className="self-start rounded-xl bg-amber-100 px-4 py-3 text-lg"
                      onClick={() => update({ words: [...settings.words, { say: "", means: "" }] })}>
                      + 言い方を足す
                    </button>
                    <button type="button" onClick={save} className="rounded-2xl bg-amber-600 py-4 text-2xl text-white">
                      {saved ? "保存しました" : "呼び方を保存"}
                    </button>
                  </section>
                  <DictionarySuggestions
                    settings={settings}
                    entries={entries}
                    onAdd={async (word) => {
                      const next = { ...settings, words: [...settings.words.filter((w) => w.say !== word.say), word] };
                      await saveSettings(next);
                      setSettings(next);
                    }}
                  />
                </>
              )}

              {panel === "entries" && (
                <section className={card}>
                  <div className="grid grid-cols-3 gap-3">
                    {KINDS.map((k) => (
                      <button key={k} type="button" onClick={() => { setKind(k); setEditing(null); }}
                        className={`rounded-2xl py-4 text-2xl ${k === kind ? "bg-amber-600 text-white" : "bg-amber-100"}`}>
                        {k}({count(k)})
                      </button>
                    ))}
                  </div>
                  {kind === "場所" && (
                    <p className="rounded-xl bg-rose-50 p-3 text-lg">
                      物の置き場所の赤い丸は、
                      <button type="button" onClick={() => { setKind("物"); setEditing(null); }} className="font-bold text-rose-700 underline">
                        「物」のタブ
                      </button>
                      で付けます。ここでは部屋の写真を登録します。
                    </p>
                  )}
                  <EntryForm key={editing?.id ?? `new-${kind}`} kind={kind} entry={editing}
                    rooms={entries.filter((e) => e.kind === "場所" && e.photo && e.id !== editing?.id)}
                    onCreateRoom={async (name, photo) => {
                      const room: Entry = { id: crypto.randomUUID(), kind: "場所", name, note: "", photo, updatedAt: Date.now() };
                      await putEntry(room);
                      setEntries(await listEntries());
                      return room;
                    }}
                    onDone={async (entry) => {
                      if (entry) await putEntry(entry);
                      setEntries(await listEntries());
                      setEditing(null);
                    }} />
                  <ul className="grid gap-3">
                    {shown.map((e) => (
                      <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)}
                        roomName={entries.find((r) => r.id === e.spot?.roomId)?.name}
                        onDelete={async () => {
                          if (!confirm(`「${e.name}」を消します。よろしいですか?`)) return;
                          await deleteEntry(e.id);
                          setEntries(await listEntries());
                        }} />
                    ))}
                    {shown.length === 0 && <p className="text-lg text-zinc-500">まだありません。{KIND_HINT[kind]}</p>}
                  </ul>
                </section>
              )}

              {panel === "voice" && (
                <VoiceChooser
                  key={`voice-${restored}-${loaded}`}
                  initial={settings.voice}
                  userCallName={settings.userCallName}
                  onSave={(voice) => saveMerged({ voice })}
                />
              )}

              {panel === "memories" && (
                <MemoriesEditor
                  key={`memories-${restored}-${loaded}`}
                  settings={settings}
                  entries={entries}
                  onSave={saveMerged}
                />
              )}

              {panel === "messages" && (
                <MessageRecorder
                  key={restored}
                  defaultFrom={settings.familyCallName === DEFAULT_SETTINGS.familyCallName ? "" : settings.familyCallName} />
              )}

              {panel === "line" && (
                <LineSettings key={`line-${restored}-${loaded}`} settings={settings} onSave={saveMerged} />
              )}

              {panel === "wake" && (
                <section className={card}>
                  <p className="text-lg text-zinc-600">
                    オンにすると、ボタンを押さなくても「リンちゃん」と呼ぶだけで話を聞きます。「あれどこかしら」のように探す言葉が聞こえたら、声は出さずに写真を出します。
                  </p>
                  <ul className="list-disc pl-6 text-lg text-zinc-600">
                    <li>iPad がまわりの声を聞き続けます。家にいる方に伝えてからオンにしてください</li>
                    <li>当てはまらなかった言葉は、この iPad にも残しません。ただし聞き取りには iPad の音声認識を使うので、声が Apple に送られることがあります</li>
                    <li>開いたあと、一度画面に触ると聞き始めます。聞いている間は、話す画面の左下に緑の点が出ます</li>
                    <li>電池を使うので、充電しながら使ってください</li>
                  </ul>
                  <button
                    type="button"
                    aria-pressed={!!settings.wakeMode}
                    onClick={() => saveMerged({ wakeMode: !settings.wakeMode })}
                    className={`rounded-2xl py-4 text-2xl text-white ${settings.wakeMode ? "bg-emerald-700" : "bg-zinc-500"}`}
                  >
                    {settings.wakeMode ? "オンです(押すとオフ)" : "オフです(押すとオン)"}
                  </button>
                </section>
              )}

              {panel === "backup" && (
                <>
                  {persisted === false && (
                    <p className="rounded-2xl bg-amber-100 p-4 text-lg">
                      Safari は、7日ほど使わないとデータを消すことがあります。毎日使えば消えませんが、念のためバックアップを取っておいてください。(ホーム画面に追加すると声の聞き取りが使えないので、Safari のまま使ってください)
                    </p>
                  )}
                  <Backup
                    onImported={async () => {
                      setSettings((await getSettings()) ?? DEFAULT_SETTINGS);
                      setEntries(await listEntries());
                      setEditing(null);
                      setRestored((n) => n + 1);
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Backup({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className={card}>
      <h2 className="text-2xl font-bold">バックアップ</h2>
      <p className="text-lg text-zinc-600">
        写真も含めて1つのファイルにします。ご家族のスマホや PC に保存しておくと、iPad を変えたときやデータが消えたときに戻せます。ファイルには登録した内容がそのまま入るので、扱いに気をつけてください。
      </p>
      {!file ? (
        <button type="button" disabled={busy} className="rounded-2xl bg-amber-600 py-4 text-2xl text-white disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              setFile(await exportBackup());
            } finally {
              setBusy(false);
            }
          }}>
          {busy ? "準備しています…" : "バックアップを作る"}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-lg">
            できました({Math.max(1, Math.round(file.size / 1024))}KB)。「送る・保存する」から、AirDrop、ファイル、LINE などで保存先を選んでください。
          </p>
          {/* 共有シートはタップの直後にしか開けないので、準備とは別のボタンにする */}
          <button type="button" className="rounded-2xl bg-amber-600 py-4 text-2xl text-white"
            onClick={async () => {
              const result = await saveBackupFile(file);
              setMessage(result === "cancelled" ? "保存をやめました" : result === "shared" ? "渡しました" : "ダウンロードしました");
              if (result !== "cancelled") setFile(null);
            }}>
            送る・保存する
          </button>
        </div>
      )}

      <label className="cursor-pointer self-start rounded-xl bg-zinc-200 px-4 py-3 text-lg">
        バックアップから戻す
        <input type="file" accept="application/json,.json" className="hidden"
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            if (!confirm("今の登録をすべて、このバックアップの内容に置き換えます。よろしいですか?")) return;
            try {
              const { entries, messages } = await importBackup(picked);
              await onImported();
              setMessage(`戻しました(登録 ${entries} 件、伝言 ${messages} 件)`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "戻せませんでした");
            }
          }} />
      </label>
      {message && <p className="text-xl">{message}</p>}
    </section>
  );
}

function EntryForm({
  kind,
  entry,
  rooms,
  onCreateRoom,
  onDone,
}: {
  kind: Kind;
  entry: Entry | null;
  // 置き場所を示せる部屋(写真つきの「場所」)
  rooms: Entry[];
  // その場で部屋の写真を撮って「場所」に登録する
  onCreateRoom: (name: string, photo: Blob) => Promise<Entry>;
  onDone: (e: Entry | null) => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [photo, setPhoto] = useState<Blob | undefined>(entry?.photo);
  const [spot, setSpot] = useState<Spot | undefined>(entry?.spot);
  // 部屋を選んだだけでは丸を付けない(押していない場所に丸が出ないように)。部屋が1つなら最初から写真を出す
  const [chosenRoomId, setChosenRoomId] = useState<string>();
  const roomId = chosenRoomId ?? spot?.roomId ?? (rooms.length === 1 ? rooms[0].id : undefined);
  const room = rooms.find((r) => r.id === roomId);
  const formRef = useRef<HTMLDivElement>(null);
  // 一覧の下のほうで「直す」を押しても、入力欄が見えるように
  useEffect(() => {
    if (entry) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [entry]);
  const [busy, setBusy] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const preview = usePhotoUrl(photo);
  const isThing = (entry?.kind ?? kind) === "物";

  const submit = () => {
    if (!name.trim()) return;
    onDone({
      id: entry?.id ?? crypto.randomUUID(),
      kind: entry?.kind ?? kind,
      name: name.trim(),
      note: note.trim(),
      photo,
      spot: spot && rooms.some((r) => r.id === spot.roomId) ? spot : undefined,
      updatedAt: Date.now(),
    });
  };

  const pickPhoto = async (file: File | undefined, apply: (b: Blob) => void | Promise<void>) => {
    if (!file) return;
    setBusy(true);
    try {
      await apply(await shrinkPhoto(file));
    } finally {
      setBusy(false);
    }
  };

  const step = "flex flex-col gap-2 rounded-xl bg-amber-50 p-3";
  const stepTitle = "text-lg font-bold";

  return (
    <div ref={formRef} className="flex scroll-mt-4 flex-col gap-3 rounded-2xl border-2 border-dashed border-amber-300 p-4">
      <h3 className="text-xl font-bold">{entry ? `「${entry.name}」を直す` : `「${kind}」を足す`}</h3>

      <div className={step}>
        <p className={stepTitle}>1. 名前</p>
        <input className={field} value={name} placeholder={KIND_HINT[kind]} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className={step}>
        <p className={stepTitle}>2. {isThing ? "物" : kind}の写真</p>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="" className="h-28 w-28 rounded-xl object-cover" />}
          <label className="cursor-pointer rounded-xl bg-amber-100 px-4 py-3 text-lg">
            {busy ? "写真を準備中…" : preview ? "写真を変える" : "写真を撮る・選ぶ"}
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0], setPhoto)} />
          </label>
        </div>
      </div>

      {isThing && (
        // 試用で、置き場所を選ぶ欄が見つからなかったので、手順の1つとしてはっきり出す
        <div className={step}>
          <p className={stepTitle}>3. どこにありますか?</p>
          {rooms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <button key={r.id} type="button" onClick={() => {
                  setChosenRoomId(r.id);
                  if (spot?.roomId !== r.id) setSpot(undefined);
                  setAddingRoom(false);
                }}
                  className={`rounded-xl px-4 py-2 text-lg ${roomId === r.id ? "bg-amber-600 text-white" : "bg-white"}`}>
                  {r.name}
                </button>
              ))}
              <button type="button" onClick={() => setAddingRoom(true)} className="rounded-xl bg-white px-4 py-2 text-lg">
                + ほかの部屋
              </button>
            </div>
          )}
          {(rooms.length === 0 || addingRoom) && (
            <div className="flex flex-col gap-2">
              <p className="text-lg text-zinc-600">置いてある部屋(や棚)の写真を撮ってください。部屋の写真は、ほかの物でも使えます。</p>
              <input className={field} value={newRoomName} placeholder="部屋の名前(例:居間、台所、寝室の棚)"
                onChange={(e) => setNewRoomName(e.target.value)} />
              <label className={`cursor-pointer self-start rounded-xl px-4 py-3 text-lg ${newRoomName.trim() ? "bg-amber-100" : "bg-zinc-100 text-zinc-400"}`}>
                {busy ? "写真を準備中…" : "部屋の写真を撮る"}
                <input type="file" accept="image/*" className="hidden" disabled={!newRoomName.trim()}
                  onChange={(e) => pickPhoto(e.target.files?.[0], async (b) => {
                    const created = await onCreateRoom(newRoomName.trim(), b);
                    setChosenRoomId(created.id);
                    setSpot(undefined);
                    setNewRoomName("");
                    setAddingRoom(false);
                  })} />
              </label>
            </div>
          )}
          {room?.photo && (
            <>
              <p className="text-lg font-bold text-rose-700">
                {spot ? "赤い丸を付けました。押し直すと動きます" : "写真の上で、置いてある場所を押してください。赤い丸が付きます"}
              </p>
              <SpotPhoto room={room.photo} spot={spot} className="max-h-80 self-start"
                onPick={(x, y) => setSpot({ roomId: room.id, x, y })} />
              {spot && (
                <button type="button" onClick={() => setSpot(undefined)} className="self-start text-base text-zinc-500 underline">
                  赤い丸を消す
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className={step}>
        <p className={stepTitle}>{isThing ? "4" : "3"}. 短い説明(なくても大丈夫です)</p>
        <textarea className={field} rows={2} value={note}
          placeholder={isThing ? "例:青いケースに入っています" : "例:娘です。火曜と金曜のお昼に来ます"}
          onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={submit} disabled={busy || !name.trim()}
          className="flex-1 rounded-2xl bg-amber-600 py-4 text-2xl text-white disabled:opacity-40">
          {entry ? "直す" : "登録する"}
        </button>
        {entry && (
          <button type="button" onClick={() => onDone(null)} className="rounded-2xl bg-zinc-200 px-6 text-xl">
            やめる
          </button>
        )}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  roomName,
  onEdit,
  onDelete,
}: {
  entry: Entry;
  roomName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const url = usePhotoUrl(entry.photo);
  return (
    <li className="flex items-start gap-4 rounded-2xl bg-amber-50 p-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-zinc-500">写真なし</div>
      )}
      <div className="flex-1">
        <p className="text-xl font-bold">{entry.name}</p>
        <p className="text-lg">{entry.note}</p>
        {roomName && <p className="text-lg text-rose-700">置き場所:{roomName}の写真に印あり</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        {entry.kind === "物" && !roomName && (
          <button type="button" onClick={onEdit} className="rounded-xl bg-rose-600 px-4 py-2 text-lg text-white">置き場所を付ける</button>
        )}
        <button type="button" onClick={onEdit} className="rounded-xl bg-amber-100 px-4 py-2 text-lg">直す</button>
        <button type="button" onClick={onDelete} className="rounded-xl bg-zinc-200 px-4 py-2 text-lg">消す</button>
      </div>
    </li>
  );
}
