import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendLineChecked, type Env } from "../../lib/line";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 伝言への本人の返事を、その場で家族の LINE に知らせる。文はここで組み立て、保存はしない
export async function POST(request: Request) {
  const body = (await request.json()) as {
    from?: string;
    message?: string;
    reply?: string;
    userCallName?: string;
  };
  const env = getCloudflareContext().env as Env;
  const reply = text(body.reply, 500);
  if (!reply) return Response.json({ sent: false, reason: "返事が空です" }, { status: 400 });
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
  const line = `【伝言への返事】${when}\n${from}からの伝言${message ? `「${message}」` : ""}に、${user}が「${reply}」と答えました。`;
  return sendLineChecked(request, env, line);
}
