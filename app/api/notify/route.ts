import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendLineChecked, type Env } from "../../lib/line";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 伝言への本人の返事や「わかった」を、その場で家族の LINE に知らせる。文はここで組み立て、保存はしない
export async function POST(request: Request) {
  const body = (await request.json()) as {
    from?: string;
    message?: string;
    reply?: string;
    // 返事はせず「わかった」を押したとき
    understood?: boolean;
    userCallName?: string;
  };
  const env = getCloudflareContext().env as Env;
  const reply = text(body.reply, 500);
  if (!reply && !body.understood) return Response.json({ sent: false, reason: "返事が空です" }, { status: 400 });
  const from = text(body.from, 20) || "ご家族";
  const user = text(body.userCallName, 20) || "ご本人";
  const message = text(body.message, 300);
  const when = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const quoted = `${from}からの伝言${message ? `「${message}」` : ""}`;
  const line = reply
    ? `【伝言への返事】${when}\n${quoted}に、${user}が「${reply}」と答えました。`
    : `【伝言への返事】${when}\n${quoted}を${user}が聞いて、「わかった」を押しました。`;
  return sendLineChecked(request, env, line);
}
