import Anthropic from "@anthropic-ai/sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { keyConfigured, lineReady, LINE_MAX, sendLineChecked, type Env } from "../../lib/line";
import { resolveProfile } from "../../lib/profile";

// 記録の要約なので Sonnet を使う(CLAUDE.md の技術構成)
const MODEL = "claude-sonnet-5-5";

type Record = {
  at: string;
  heard: string;
  reply: string;
  reask: number;
  pick?: { kind: string; candidates: string[]; chosen: string | null };
  understood?: boolean;
  prompt?: string;
  reactionTo?: string;
};
type Memo = { at: string; text: string };

// 画面が「LINE に送る」を出してよいかだけを返す(トークンや合言葉そのものは返さない)
export async function GET() {
  const env = getCloudflareContext().env as Env;
  return Response.json({ lineReady: lineReady(env), keyConfigured: keyConfigured(env) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as
    | { action: "draft"; records: Record[]; memos: Memo[]; profile?: unknown }
    | { action: "send"; text: string };
  const env = getCloudflareContext().env as Env;

  if (body.action === "send") {
    // 送るのは家族が確認・編集した文だけ。ここでは保存しない
    return sendLineChecked(request, env, String(body.text ?? ""));
  }

  const { profile } = resolveProfile(body.profile);
  const user = profile.userCallName;
  const fmt = (at: string) =>
    new Date(at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
  const lines = [
    ...body.records.map((r) => {
      const tags = [
        r.reask ? `聞き返し${r.reask}回目への返事` : "",
        r.pick
          ? `写真で選ぶ:候補 ${r.pick.candidates.join("・") || "なし"} → ${r.pick.chosen ?? "選ばなかった"}`
          : "",
        r.prompt ? `リンちゃんから話しかけた(${r.prompt})` : "",
        r.reactionTo ? `${r.reactionTo}への反応` : "",
        r.understood === true ? "家族の印:伝わった" : r.understood === false ? "家族の印:伝わらなかった" : "",
      ].filter(Boolean);
      return {
        at: r.at,
        text: `${fmt(r.at)} 本人「${r.heard}」/ リンちゃん「${r.reply}」${tags.length ? `(${tags.join("、")})` : ""}`,
      };
    }),
    ...body.memos.map((m) => ({ at: m.at, text: `${fmt(m.at)} 付き添いの家族のメモ:${m.text}` })),
  ]
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map((l) => l.text);
  if (lines.length === 0) return Response.json({ report: "" });

  const system = `あなたは、もの忘れが増えた${user}を見守る家族のために、iPad の「リンちゃん」との会話の記録を、LINE で読む短い報告にまとめます。

次の見出しで、それぞれ箇条書き(「・」)にします。全体で600文字くらいまで。絵文字や Markdown の記号は使いません。
【今日のようす】時間と回数で、ひとことずつ
【${user}が話したこと】${user}の話として書く。事実かどうかは分からないので「〜と話していました」の形にする
【記録で確かめられたこと】写真で何を選んだか、伝言を聞いたか、リンちゃんが何を伝えたか、など記録に残っている事実だけ
【伝わり方】聞き返しの回数、どの言い直しで伝わったか(家族の印があればそれを使う)
【気になったこと】言葉の取り違え、つらそうな言葉、同じことを何度も聞いていたこと(回数も)、くり返し出た話題など。なければ「特になし」

- ${user}の話と、記録で確かめられた事実を混ぜません
- 病気の診断、評価、助言は書きません。「心配です」「〜すべき」とも書きません
- 記録にないことは書きません
- くり返しは、${user}を責める書き方にしません(例:「眼鏡の場所を3回たずねていました」)`;

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "medium" },
      // 安全のための判定で断られたときは、サーバー側で別のモデルにやり直してもらう
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: `# 今日の記録(古い順)\n${lines.join("\n")}` }],
    });
    if (response.stop_reason === "refusal")
      return Response.json({ report: "", error: true }, { status: 502 });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    const date = new Date().toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    return Response.json({ report: `リンちゃんからの報告(${date})\n\n${text}`.slice(0, LINE_MAX) });
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`API エラー ${error.status}:`, error.message);
    else console.error(error);
    return Response.json({ report: "", error: true }, { status: 502 });
  }
}
