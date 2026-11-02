"use client";

import type { Kind, Profile, Word } from "./types";

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
