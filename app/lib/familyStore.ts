"use client";

import { KINDS, type Kind, type Profile, type Word } from "./types";

// 家族が登録した情報は、この iPad の IndexedDB にだけ保存する(サーバーには置かない)
export type Settings = {
  assistantName: string;
  userCallName: string;
  familyCallName: string;
  words: Word[];
};

export type Entry = {
  id: string;
  kind: Kind;
  name: string;
  note: string;
  photo?: Blob;
  updatedAt: number;
};

export const DEFAULT_SETTINGS: Settings = {
  assistantName: "リンちゃん",
  userCallName: "",
  familyCallName: "ご家族",
  words: [],
};

const DB_NAME = "rin-family";
const SETTINGS = "settings";
const ENTRIES = "entries";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(SETTINGS);
      db.createObjectStore(ENTRIES, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSettings(): Promise<Settings | null> {
  return (await run<Settings | undefined>(SETTINGS, "readonly", (s) => s.get("main"))) ?? null;
}

export async function saveSettings(settings: Settings) {
  await run(SETTINGS, "readwrite", (s) => s.put(settings, "main"));
}

export async function listEntries(): Promise<Entry[]> {
  const all = await run<Entry[]>(ENTRIES, "readonly", (s) => s.getAll());
  return all.sort((a, b) => a.updatedAt - b.updatedAt);
}

export async function putEntry(entry: Entry) {
  await run(ENTRIES, "readwrite", (s) => s.put(entry));
}

export async function deleteEntry(id: string) {
  await run(ENTRIES, "readwrite", (s) => s.delete(id));
}

// Safari は使われないサイトのデータを消すことがあるので、消さないように頼んでおく
export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// 登録がなければ null を返し、サーバー側の架空サンプルで動かす
export function toProfile(settings: Settings | null, entries: Entry[]): Profile | null {
  if (!settings?.userCallName && entries.length === 0) return null;
  const s = settings ?? DEFAULT_SETTINGS;
  return {
    assistantName: s.assistantName || DEFAULT_SETTINGS.assistantName,
    userCallName: s.userCallName || "あなた",
    familyCallName: s.familyCallName || DEFAULT_SETTINGS.familyCallName,
    words: s.words.filter((w) => w.say && w.means),
    manual: entries.map(({ kind, name, note }) => ({ kind, name, note })),
  };
}

// 写真は長い辺 1200px の JPEG に縮めてから保存する
export async function shrinkPhoto(file: File, maxSide = 1200): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("写真を変換できません"))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- バックアップ(書き出し・読み込み) ----
// 写真も含めて1つの JSON ファイルにする。保存先は家族のスマホや PC で、サーバーには置かない
const BACKUP_FORMAT = "rin-family-backup";

type BackupEntry = Omit<Entry, "photo"> & { photo?: string };
type Backup = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  settings: Settings | null;
  entries: BackupEntry[];
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export async function exportBackup(): Promise<File> {
  const [settings, entries] = await Promise.all([getSettings(), listEntries()]);
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    entries: await Promise.all(
      entries.map(async (e) => ({ ...e, photo: e.photo ? await blobToDataUrl(e.photo) : undefined })),
    ),
  };
  const date = new Date().toLocaleDateString("sv-SE"); // 2026-11-03 の形
  return new File([JSON.stringify(backup)], `rin-backup-${date}.json`, { type: "application/json" });
}

// 今の登録をすべて消して、バックアップの内容に置き換える
export async function importBackup(file: File): Promise<{ entries: number }> {
  let backup: Backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error("ファイルを読めませんでした");
  }
  if (backup?.format !== BACKUP_FORMAT || !Array.isArray(backup.entries)) {
    throw new Error("リンちゃんのバックアップファイルではありません");
  }
  const entries: Entry[] = await Promise.all(
    backup.entries.filter((e) => KINDS.includes(e?.kind) && e.name).map(async (e) => ({
      id: e.id || crypto.randomUUID(),
      kind: e.kind,
      name: e.name,
      note: e.note ?? "",
      updatedAt: e.updatedAt ?? Date.now(),
      photo: e.photo ? await (await fetch(e.photo)).blob() : undefined,
    })),
  );
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SETTINGS, ENTRIES], "readwrite");
    const store = tx.objectStore(ENTRIES);
    store.clear();
    for (const e of entries) store.put(e);
    if (backup.settings) tx.objectStore(SETTINGS).put(backup.settings, "main");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return { entries: entries.length };
}

// iPad では共有シート(AirDrop・ファイル・LINE など)で渡す。使えなければダウンロードする
export async function saveBackupFile(file: File): Promise<"shared" | "downloaded" | "cancelled"> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "リンちゃんのバックアップ" });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
