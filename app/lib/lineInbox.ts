"use client";

import { getSettings, listMessages, putMessage, saveSettings, type LineSender, type Message, type Settings } from "./familyStore";

type Item = {
  key: string;
  id: string;
  type: "audio" | "text";
  userId: string;
  name: string;
  at: number;
  mime?: string;
  data?: string;
  text?: string;
};

const fromBase64 = (data: string, mime: string) => {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

// 呼び名が決まっていない送り主は「ご家族」。LINE の表示名は本人には見せない
export const senderCallName = (senders: LineSender[] | undefined, userId?: string) =>
  senders?.find((s) => s.userId === userId)?.callName || "ご家族";

// LINE で届いた伝言を取りに行き、この iPad に保存してから、サーバーの分を消してもらう
export async function pullLineMessages(settings: Settings | null): Promise<Message[]> {
  const key = settings?.lineKey;
  if (!key) return [];
  const res = await fetch("/api/inbox", { headers: { "x-rin-key": key }, cache: "no-store" });
  if (!res.ok) return [];
  const { items = [] } = (await res.json()) as { items?: Item[] };
  if (items.length === 0) return [];

  // 初めての送り主は、家族の登録画面で呼び名を決められるように覚えておく
  const latest = (await getSettings()) ?? settings!;
  const senders = [...(latest.lineSenders ?? [])];
  let changed = false;
  for (const it of items) {
    const known = senders.find((s) => s.userId === it.userId);
    if (!known) {
      senders.push({ userId: it.userId, lineName: it.name, callName: "" });
      changed = true;
    } else if (it.name && known.lineName !== it.name) {
      known.lineName = it.name;
      changed = true;
    }
  }
  if (changed) await saveSettings({ ...latest, lineSenders: senders });

  const saved: Message[] = [];
  // 前に受け取ったのに消せていなかった分は、もう一度保存しない(聞いた記録を消さないため)
  const have = new Set((await listMessages()).map((m) => m.id));
  for (const it of items) {
    if (have.has(`line-${it.id}`)) continue;
    const message: Message = {
      id: `line-${it.id}`,
      from: senderCallName(senders, it.userId),
      lineUserId: it.userId,
      createdAt: it.at,
      ...(it.type === "audio" && it.data
        ? { audio: fromBase64(it.data, it.mime ?? "audio/mp4") }
        : { text: it.text ?? "" }),
    };
    if (!message.audio && !message.text) continue;
    await putMessage(message);
    saved.push(message);
  }
  await fetch("/api/inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-rin-key": key },
    body: JSON.stringify({ keys: items.map((i) => i.key) }),
  }).catch(() => {});
  return saved;
}
