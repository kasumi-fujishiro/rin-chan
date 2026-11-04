import "server-only";

// LINE への送信。送り先は家族のスマホなので、合言葉(RIN_APP_KEY)が合うときだけ送る
const LINE_PUSH = "https://api.line.me/v2/bot/message/push";
// 送り先の ID がないときは、公式アカウントを友だち追加した家族全員に送る
const LINE_BROADCAST = "https://api.line.me/v2/bot/message/broadcast";
// LINE のテキストメッセージは 5000 文字まで
export const LINE_MAX = 5000;

export type Env = { [key: string]: string | undefined };

export const lineReady = (env: Env) => Boolean(env.LINE_CHANNEL_ACCESS_TOKEN);
export const keyConfigured = (env: Env) => Boolean(env.RIN_APP_KEY);

// iPad が送ってきた合言葉が、secret の RIN_APP_KEY と同じか(長さが違っても時間が変わらない比べ方)
export function hasValidKey(request: Request, env: Env): boolean {
  const expected = env.RIN_APP_KEY;
  const given = request.headers.get("x-rin-key") ?? "";
  if (!expected) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function sendLine(
  env: Env,
  text: string,
): Promise<{ sent: boolean; reason?: string; status?: number }> {
  if (!lineReady(env)) return { sent: false, reason: "LINE の設定がまだです", status: 400 };
  const body = text.slice(0, LINE_MAX);
  if (!body.trim()) return { sent: false, reason: "送る文が空です", status: 400 };
  const res = await fetch(env.LINE_TO ? LINE_PUSH : LINE_BROADCAST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({
      ...(env.LINE_TO ? { to: env.LINE_TO } : {}),
      messages: [{ type: "text", text: body }],
    }),
  });
  if (!res.ok) {
    console.error("LINE への送信に失敗", res.status, await res.text());
    return { sent: false, reason: `LINE への送信に失敗しました(${res.status})`, status: 502 };
  }
  return { sent: true };
}

// 合言葉を確かめてから送る。合わなければ断る
export async function sendLineChecked(request: Request, env: Env, text: string): Promise<Response> {
  if (!keyConfigured(env)) {
    return Response.json({ sent: false, reason: "合言葉がまだ設定されていません" }, { status: 403 });
  }
  if (!hasValidKey(request, env)) {
    return Response.json(
      { sent: false, reason: "合言葉がちがいます。家族の登録画面で入れ直してください" },
      { status: 403 },
    );
  }
  const result = await sendLine(env, text);
  return Response.json(
    { sent: result.sent, reason: result.reason },
    { status: result.sent ? 200 : (result.status ?? 502) },
  );
}
