import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deleteInbox, inboxOf, listInbox } from "../../lib/inbox";
import { hasValidKey, keyConfigured, type Env } from "../../lib/line";

// iPad が LINE からの伝言を取りに来る口。合言葉が合うときだけ渡し、受け取ったら消す
function check(request: Request) {
  const env = getCloudflareContext().env as unknown as Env & Record<string, unknown>;
  const kv = inboxOf(env);
  if (!kv) return { error: Response.json({ items: [], reason: "受け取り口の設定がまだです" }, { status: 503 }) };
  if (!keyConfigured(env) || !hasValidKey(request, env)) {
    return { error: Response.json({ items: [], reason: "合言葉がちがいます" }, { status: 403 }) };
  }
  return { kv };
}

export async function GET(request: Request) {
  const { kv, error } = check(request);
  if (!kv) return error;
  return Response.json({ items: await listInbox(kv) }, { headers: { "Cache-Control": "no-store" } });
}

// 受け取った伝言を消す
export async function POST(request: Request) {
  const { kv, error } = check(request);
  if (!kv) return error;
  const { keys } = (await request.json()) as { keys?: unknown };
  const list = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string").slice(0, 50) : [];
  await deleteInbox(kv, list);
  return Response.json({ deleted: list.length });
}
