"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  deleteEntry,
  getSettings,
  listEntries,
  putEntry,
  requestPersist,
  saveSettings,
  shrinkPhoto,
  type Entry,
  type Settings,
} from "../lib/familyStore";
import { KINDS, type Kind } from "../lib/types";
import { usePhotoUrl } from "../lib/usePhotoUrl";

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

  useEffect(() => {
    (async () => {
      setSettings((await getSettings()) ?? DEFAULT_SETTINGS);
      setEntries(await listEntries());
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
          onDone={async (entry) => {
            if (entry) await putEntry(entry);
            setEntries(await listEntries());
            setEditing(null);
          }} />
        <ul className="grid gap-3">
          {shown.map((e) => (
            <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)}
              onDelete={async () => {
                if (!confirm(`「${e.name}」を消します。よろしいですか?`)) return;
                await deleteEntry(e.id);
                setEntries(await listEntries());
              }} />
          ))}
          {shown.length === 0 && <p className="text-lg text-zinc-500">まだありません。{KIND_HINT[kind]}</p>}
        </ul>
      </section>
    </main>
  );
}

function EntryForm({ kind, entry, onDone }: { kind: Kind; entry: Entry | null; onDone: (e: Entry | null) => void }) {
  const [name, setName] = useState(entry?.name ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [photo, setPhoto] = useState<Blob | undefined>(entry?.photo);
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
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-amber-300 p-4">
      <h3 className="text-xl font-bold">{entry ? `「${entry.name}」を直す` : `「${kind}」を足す`}</h3>
      <input className={field} value={name} placeholder={`名前(${KIND_HINT[kind]})`} onChange={(e) => setName(e.target.value)} />
      <textarea className={field} rows={3} value={note}
        placeholder="短い説明(例:ふだんは居間のテーブルの、青いケースに入っています)"
        onChange={(e) => setNote(e.target.value)} />
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

function EntryRow({ entry, onEdit, onDelete }: { entry: Entry; onEdit: () => void; onDelete: () => void }) {
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
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <button type="button" onClick={onEdit} className="rounded-xl bg-amber-100 px-4 py-2 text-lg">直す</button>
        <button type="button" onClick={onDelete} className="rounded-xl bg-zinc-200 px-4 py-2 text-lg">消す</button>
      </div>
    </li>
  );
}
