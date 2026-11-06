import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hasValidKey, keyConfigured, type Env } from "../../lib/line";

// 一時的な調査用:iPad の聞き取りの動き(出来事の名前と時刻だけ。話した言葉は入らない)を、配信中の記録に流す。保存はしない
export async function POST(request: Request) {
  const env = getCloudflareContext().env as unknown as Env;
  if (!keyConfigured(env) || !hasValidKey(request, env)) return new Response("no", { status: 403 });
  const { log } = (await request.json()) as { log?: unknown };
  if (Array.isArray(log)) console.log(`speech-diag\n${log.map(String).reverse().join("\n").slice(0, 4000)}`);
  return new Response("ok");
}
