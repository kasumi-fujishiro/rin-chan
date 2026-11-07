"use client";

import { KINDS, type Kind, type Memory, type Profile, type Word } from "./types";

// 家族が登録した情報は、この iPad の IndexedDB にだけ保存する(サーバーには置かない)
export type Settings = {
  assistantName: string;
  userCallName: string;
  familyCallName: string;
  words: Word[];
  // 後から足した項目なので、古い保存データにはない
  memories?: Memory[];
  dayService?: DayService;
  // リンちゃんの声。iPad に入っている声から、家族が聞き比べて選ぶ
  voice?: VoiceSetting;
  // LINE に送るときの合言葉(Cloudflare の RIN_APP_KEY と同じもの)と、伝言の返事を知らせるか
  lineKey?: string;
  notifyReplies?: boolean;
  // LINE で伝言を送ってきた家族。LINE の表示名を、本人が分かる呼び方(「お母さん」など)に置き換える
  lineSenders?: LineSender[];
  // 呼びかけモード。オンの間は、押さなくても「リンちゃん」や探し物の言葉に反応する(最初はオフ)
  wakeMode?: boolean;
  // 毎日決まった時間に、今日の報告を自動で LINE に送る(time は "21:00" の形)
  autoReport?: { enabled: boolean; time: string };
};

export type LineSender = { userId: string; lineName: string; callName: string };

export type VoiceSetting = { name: string; rate: number; pitch: number };
export const DEFAULT_VOICE: VoiceSetting = { name: "", rate: 0.8, pitch: 1 };

// デイサービスの日。帰ってきたころにリンちゃんから声をかける
export type DayService = {
  // 0 が日曜
  weekdays: number[];
  // "16:00" の形
  returnTime: string;
  // 「場所」に登録した名前と同じなら、その写真を見せる
  placeName: string;
};

export type Entry = {
  id: string;
  kind: Kind;
  name: string;
  note: string;
  photo?: Blob;
  // 物の置き場所。「場所」に登録した部屋の写真の上の位置(0〜1)
  spot?: Spot;
  updatedAt: number;
};

export type Spot = { roomId: string; x: number; y: number };

// 家族からの伝言(家族が自分の声で録音したもの、または LINE で送った声か文字)。
// リンちゃんの声とは分けて、本人が押したときだけ流す。文字だけの伝言はリンちゃんが読み上げる
export type Message = {
  id: string;
  from: string;
  audio?: Blob;
  // LINE から届いた伝言の送り主
  lineUserId?: string;
  createdAt: number;
  // 本人が最後に聞いた時刻。まだなら undefined
  heardAt?: number;
  // 字幕(家族がキーボードの音声入力などで入れる)。画面に出し、リンちゃんも内容を知る
  text?: string;
  // 本人の返事と、伝言を終えた時刻(返事をしたか「わかった」を押したら、カードを出さない)
  reply?: string;
  doneAt?: number;
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
const MESSAGES = "messages";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // v2 で伝言を足した。v1 のデータはそのまま残す
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
      if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MESSAGES)) db.createObjectStore(MESSAGES, { keyPath: "id" });
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

export async function listMessages(): Promise<Message[]> {
  const all = await run<Message[]>(MESSAGES, "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putMessage(message: Message) {
  await run(MESSAGES, "readwrite", (s) => s.put(message));
}

export async function deleteMessage(id: string) {
  await run(MESSAGES, "readwrite", (s) => s.delete(id));
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
    manual: entries.map(({ kind, name, note, spot }) => {
      // 写真で示した置き場所も、部屋の名前として Claude に伝える(写真そのものは送らない)
      const room = spot && entries.find((e) => e.id === spot.roomId);
      return { kind, name, note: room ? `${note}${note ? " " : ""}(置き場所:${room.name})` : note };
    }),
    memories: (s.memories ?? []).filter((m) => m.title),
  };
}

// 写真は長い辺 1200px の JPEG に縮めてから保存する。
// 縮められないとき(読み込みが終わらない、変換に失敗する)は、そのまま保存して先に進む
export async function shrinkPhoto(file: File, maxSide = 1200): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    // decode() は環境によって終わらないことがあったので、load イベントで待ち、8秒で諦める
    const loaded = await Promise.race([
      new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    if (!loaded || !img.naturalWidth) return file;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- バックアップ(書き出し・読み込み) ----
// 写真も含めて1つの JSON ファイルにする。保存先は家族のスマホや PC で、サーバーには置かない
const BACKUP_FORMAT = "rin-family-backup";

type BackupEntry = Omit<Entry, "photo"> & { photo?: string };
type BackupMessage = Omit<Message, "audio"> & { audio?: string };
type Backup = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  settings: Settings | null;
  entries: BackupEntry[];
  // 伝言は後から足したので、古いバックアップにはない
  messages?: BackupMessage[];
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export async function exportBackup(): Promise<File> {
  const [settings, entries, messages] = await Promise.all([getSettings(), listEntries(), listMessages()]);
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    entries: await Promise.all(
      entries.map(async (e) => ({ ...e, photo: e.photo ? await blobToDataUrl(e.photo) : undefined })),
    ),
    messages: await Promise.all(messages.map(async (m) => ({ ...m, audio: m.audio ? await blobToDataUrl(m.audio) : undefined }))),
  };
  const date = new Date().toLocaleDateString("sv-SE"); // 2026-11-03 の形
  return new File([JSON.stringify(backup)], `rin-backup-${date}.json`, { type: "application/json" });
}

// 今の登録をすべて消して、バックアップの内容に置き換える
export async function importBackup(file: File): Promise<{ entries: number; messages: number }> {
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
      spot: e.spot,
      photo: e.photo ? await (await fetch(e.photo)).blob() : undefined,
    })),
  );
  const messages: Message[] = await Promise.all(
    (backup.messages ?? [])
      .filter((m) => (m?.audio || m?.text) && m.from)
      .map(async (m) => ({
        id: m.id || crypto.randomUUID(),
        from: m.from,
        createdAt: m.createdAt ?? Date.now(),
        heardAt: m.heardAt,
        text: m.text,
        reply: m.reply,
        doneAt: m.doneAt,
        lineUserId: m.lineUserId,
        audio: m.audio ? await (await fetch(m.audio)).blob() : undefined,
      })),
  );
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SETTINGS, ENTRIES, MESSAGES], "readwrite");
    const store = tx.objectStore(ENTRIES);
    store.clear();
    for (const e of entries) store.put(e);
    const messageStore = tx.objectStore(MESSAGES);
    messageStore.clear();
    for (const m of messages) messageStore.put(m);
    if (backup.settings) tx.objectStore(SETTINGS).put(backup.settings, "main");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return { entries: entries.length, messages: messages.length };
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
