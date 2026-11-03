"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  deleteEntry,
  exportBackup,
  importBackup,
  getSettings,
  listEntries,
  putEntry,
  requestPersist,
  saveBackupFile,
  saveSettings,
  shrinkPhoto,
  type Entry,
  type Settings,
  type Spot,
} from "../lib/familyStore";
import { KINDS, type Kind } from "../lib/types";
import { usePhotoUrl } from "../lib/usePhotoUrl";
import { DictionarySuggestions } from "./DictionarySuggestions";
import { MemoriesEditor } from "./MemoriesEditor";
import { SpotPhoto } from "./SpotPhoto";
import { MessageRecorder } from "./MessageRecorder";

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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">家族の登録</h1>
        <nav className="flex gap-4 text-lg underline">
          <Link href="/">話す画面</Link>
          <Link href="/log">試用の記録</Link>
          <Link href="/check">音声の確認</Link>
        </nav>
      </header>
      <p className="rounded-2xl bg-amber-100 p-4 text-lg">
        ここで登録したことは、この iPad の中にだけ保存されます。話しかけたときに、文字の部分だけを返事づくりに使い、写真は送りません。
        {persisted === false && " ※ Safari は、7日ほど使わないとデータを消すことがあります。毎日使えば消えませんが、念のためバックアップを取っておいてください。(ホーム画面に追加すると声の聞き取りが使えないので、Safari のまま使ってください)"}
      </p>

      <section className={card}>
        <h2 className="text-2xl font-bold">呼び方</h2>
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

      <section className={card}>
        <h2 className="text-2xl font-bold">家の説明書</h2>
        <div className="grid grid-cols-3 gap-3">
          {KINDS.map((k) => (
            <button key={k} type="button" onClick={() => { setKind(k); setEditing(null); }}
              className={`rounded-2xl py-4 text-2xl ${k === kind ? "bg-amber-600 text-white" : "bg-amber-100"}`}>
              {k}({entries.filter((e) => e.kind === k).length})
            </button>
          ))}
        </div>
        <EntryForm key={editing?.id ?? `new-${kind}`} kind={kind} entry={editing}
          rooms={entries.filter((e) => e.kind === "場所" && e.photo && e.id !== editing?.id)}
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

      <MemoriesEditor
        key={`memories-${restored}-${loaded}`}
        settings={settings}
        entries={entries}
        onSave={async (patch) => {
          // 呼び方の欄で編集中のものは保存しない(保存済みの内容に足す)
          const next = { ...((await getSettings()) ?? DEFAULT_SETTINGS), ...patch };
          await saveSettings(next);
          setSettings((s) => ({ ...s, ...patch }));
        }}
      />

      <MessageRecorder
        key={restored}
        defaultFrom={settings.familyCallName === DEFAULT_SETTINGS.familyCallName ? "" : settings.familyCallName} />

      <Backup
        onImported={async () => {
          setSettings((await getSettings()) ?? DEFAULT_SETTINGS);
          setEntries(await listEntries());
          setEditing(null);
          setRestored((n) => n + 1);
        }}
      />
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
  onDone,
}: {
  kind: Kind;
  entry: Entry | null;
  // 置き場所を示せる部屋(写真つきの「場所」)
  rooms: Entry[];
  onDone: (e: Entry | null) => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [photo, setPhoto] = useState<Blob | undefined>(entry?.photo);
  const [spot, setSpot] = useState<Spot | undefined>(entry?.spot);
  const room = rooms.find((r) => r.id === spot?.roomId);
  const [busy, setBusy] = useState(false);
  const preview = usePhotoUrl(photo);

  const submit = () => {
    if (!name.trim()) return;
    onDone({
      id: entry?.id ?? crypto.randomUUID(),
      kind: entry?.kind ?? kind,
      name: name.trim(),
      note: note.trim(),
      photo,
      spot: room ? spot : undefined,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-amber-300 p-4">
      <h3 className="text-xl font-bold">{entry ? `「${entry.name}」を直す` : `「${kind}」を足す`}</h3>
      <input className={field} value={name} placeholder={`名前(${KIND_HINT[kind]})`} onChange={(e) => setName(e.target.value)} />
      <textarea className={field} rows={3} value={note}
        placeholder={(entry?.kind ?? kind) === "物" ? "短い説明(下で置き場所を写真で示せば、なくても大丈夫です)" : "短い説明(例:ふだんは居間のテーブルの、青いケースに入っています)"}
        onChange={(e) => setNote(e.target.value)} />
      {(entry?.kind ?? kind) === "物" && (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
          <p className="text-lg font-bold">置き場所を写真で示す</p>
          {rooms.length === 0 ? (
            <p className="text-lg text-zinc-600">「場所」に部屋の写真(居間、台所など)を登録すると、その写真の上で置き場所を示せます。</p>
          ) : (
            <>
              <select className={field} value={spot?.roomId ?? ""}
                onChange={(e) => setSpot(e.target.value ? { roomId: e.target.value, x: 0.5, y: 0.5 } : undefined)}>
                <option value="">示さない</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {room?.photo && (
                <>
                  <p className="text-lg text-zinc-600">写真の上で、置いてある場所を押してください。</p>
                  <SpotPhoto room={room.photo} spot={spot} className="max-h-80"
                    onPick={(x, y) => setSpot({ roomId: room.id, x, y })} />
                </>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="" className="h-28 w-28 rounded-xl object-cover" />}
        <label className="cursor-pointer rounded-xl bg-amber-100 px-4 py-3 text-lg">
          {busy ? "写真を準備中…" : preview ? "写真を変える" : "写真を撮る・選ぶ"}
          <input type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                setPhoto(await shrinkPhoto(file));
              } finally {
                setBusy(false);
              }
            }} />
        </label>
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
        <button type="button" onClick={onEdit} className="rounded-xl bg-amber-100 px-4 py-2 text-lg">直す</button>
        <button type="button" onClick={onDelete} className="rounded-xl bg-zinc-200 px-4 py-2 text-lg">消す</button>
      </div>
    </li>
  );
}
