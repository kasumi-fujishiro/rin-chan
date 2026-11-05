import "server-only";

// LINE で家族が送った伝言の一時置き場(Cloudflare KV)。
// サーバーに家族の声を置くのはここだけ。iPad が受け取ったらすぐ消し、受け取られなくても3日で消える
export const INBOX_TTL_SECONDS = 3 * 24 * 60 * 60;
const PREFIX = "inbox:";

export type InboxMeta = {
  type: "audio" | "text";
  // LINE の送り主の ID と表示名(iPad で家族が呼び名に置き換える)
  userId: string;
  name: string;
  at: number;
  mime?: string;
};

type KV = {
  put(
    key: string,
    value: ArrayBuffer | string,
    opts?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void>;
  getWithMetadata<M>(key: string, type: "arrayBuffer"): Promise<{ value: ArrayBuffer | null; metadata: M | null }>;
  list<M>(opts: { prefix: string; limit?: number }): Promise<{ keys: { name: string; metadata?: M }[] }>;
  delete(key: string): Promise<void>;
};

export const inboxOf = (env: Record<string, unknown>) => env.RIN_INBOX as KV | undefined;

export async function putInbox(kv: KV, id: string, value: ArrayBuffer | string, meta: InboxMeta) {
  // 古い順に並ぶように、時刻を先頭に入れる
  await kv.put(`${PREFIX}${String(meta.at).padStart(15, "0")}:${id}`, value, {
    expirationTtl: INBOX_TTL_SECONDS,
    metadata: meta,
  });
}

// 文字は KV の値に入れる(メタデータは 1024 バイトまでなので)
export type InboxItem = InboxMeta & { key: string; id: string; data?: string; text?: string };

export async function listInbox(kv: KV, limit = 10): Promise<InboxItem[]> {
  const { keys } = await kv.list<InboxMeta>({ prefix: PREFIX, limit });
  const items: InboxItem[] = [];
  for (const k of keys) {
    const { value, metadata } = await kv.getWithMetadata<InboxMeta>(k.name, "arrayBuffer");
    if (!value || !metadata) continue;
    const id = k.name.split(":").pop() ?? k.name;
    items.push({
      ...metadata,
      key: k.name,
      id,
      data: metadata.type === "audio" ? Buffer.from(value).toString("base64") : undefined,
      text: metadata.type === "text" ? new TextDecoder().decode(value) : undefined,
    });
  }
  return items;
}

export async function deleteInbox(kv: KV, keys: string[]) {
  await Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map((k) => kv.delete(k)));
}
