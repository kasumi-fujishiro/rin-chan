import { getCloudflareContext } from "@opennextjs/cloudflare";
import { inboxOf, putInbox, transcribe } from "../../../lib/inbox";
import type { Env } from "../../../lib/line";

// LINE の公式アカウントに家族が送った声や文字を受け取り、iPad が取りに来るまで一時的に置く。
// LINE からの呼び出しかどうかは、チャネルシークレットの署名で確かめる
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_MS = 3 * 60 * 1000;
const MAX_TEXT = 300;

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string; duration?: number };
};

async function validSignature(secret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = new TextEncoder().encode(btoa(String.fromCharCode(...mac)));
  const given = new TextEncoder().encode(signature);
  let diff = expected.length ^ given.length;
  for (let i = 0; i < Math.max(expected.length, given.length); i++) diff |= (expected[i] ?? 0) ^ (given[i] ?? 0);
  return diff === 0;
}

const lineHeaders = (env: Env) => ({ Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` });

async function displayName(env: Env, userId: string) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId) return "";
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: lineHeaders(env),
    });
    if (!res.ok) return "";
    return ((await res.json()) as { displayName?: string }).displayName?.slice(0, 20) ?? "";
  } catch {
    return "";
  }
}

async function replyLine(env: Env, replyToken: string | undefined, text: string) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...lineHeaders(env) },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch(() => {});
}

export async function POST(request: Request) {
  const env = getCloudflareContext().env as unknown as Env & Record<string, unknown>;
  const secret = env.LINE_CHANNEL_SECRET as string | undefined;
  const kv = inboxOf(env);
  if (!secret || !kv) return new Response("not configured", { status: 503 });
  const body = await request.text();
  if (!(await validSignature(secret, body, request.headers.get("x-line-signature")))) {
    return new Response("bad signature", { status: 401 });
  }
  const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
  for (const ev of events) {
    if (ev.type !== "message" || !ev.message) continue;
    const userId = ev.source?.userId ?? "";
    const m = ev.message;
    if (m.type === "audio") {
      if ((m.duration ?? 0) > MAX_AUDIO_MS) {
        await replyLine(env, ev.replyToken, "伝言は3分までにしてください。短くして、もう一度送ってください。");
        continue;
      }
      const res = await fetch(`https://api-data.line.me/v2/bot/message/${m.id}/content`, {
        headers: lineHeaders(env),
      });
      const audio = res.ok ? await res.arrayBuffer() : null;
      if (!audio || audio.byteLength > MAX_AUDIO_BYTES) {
        await replyLine(env, ev.replyToken, "声の伝言を受け取れませんでした。もう一度送ってください。");
        continue;
      }
      await replyLine(env, ev.replyToken, "リンちゃんの iPad に届けます。聞いて返事をしたら、お知らせします。");
      // 字幕づくりには数秒かかるので、LINE には先に答え、できてから iPad に渡す
      const at = Date.now();
      const mime = res.headers.get("content-type") ?? "audio/mp4";
      getCloudflareContext().ctx.waitUntil(
        (async () => {
          const [text, name] = await Promise.all([transcribe(env, audio), displayName(env, userId)]);
          await putInbox(kv, m.id, audio, { type: "audio", userId, name, at, mime, text });
        })(),
      );
    } else if (m.type === "text" && m.text?.trim()) {
      const text = m.text.trim().slice(0, MAX_TEXT);
      await putInbox(kv, m.id, text, {
        type: "text",
        userId,
        name: await displayName(env, userId),
        at: Date.now(),
      });
      await replyLine(env, ev.replyToken, "リンちゃんが iPad で読み上げます。聞いて返事をしたら、お知らせします。");
    } else {
      await replyLine(env, ev.replyToken, "リンちゃんに届けられるのは、声(ボイスメッセージ)と文字だけです。");
    }
  }
  return new Response("ok");
}
