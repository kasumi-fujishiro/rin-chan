import Anthropic from "@anthropic-ai/sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveProfile } from "../../lib/profile";
import { buildSystemPrompt, IGNORE_MARK, REASK_INSTRUCTIONS, reaskEndMessage } from "../../lib/prompt";

// 返事の速さを優先して Haiku を使う(CLAUDE.md の技術構成)
const MODEL = "claude-haiku-5-5";

type TalkRequest = {
  messages: Anthropic.MessageParam[];
  // 何回目の聞き返しか。0 はふつうの会話
  reask: 0 | 1 | 2 | 3;
  // iPad に保存された家族の登録内容(写真は含まない)
  profile?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as TalkRequest;
  const { messages, reask } = body;
  const { profile } = resolveProfile(body.profile);
  // API キーは本番は wrangler の secret、開発中は .dev.vars から(どちらもビルドには入らない)
  const env = getCloudflareContext().env as Record<string, string | undefined>;
  const fallback = `ごめんなさい、いま、うまくお返事できません。${profile.familyCallName}に聞いてみましょうね。`;

  // 3回目の聞き返しは Claude を使わず、やさしく終える
  if (reask >= 3) {
    return Response.json({ reply: reaskEndMessage(profile), stage: 3 });
  }

  const now = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const turnNote = [`今は ${now} です。`, reask > 0 ? REASK_INSTRUCTIONS[reask as 1 | 2] : ""]
    .filter(Boolean)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "medium" },
      system: buildSystemPrompt(profile),
      // 時刻や聞き返しの指示は毎回変わるので、system ではなく会話の最後に足す
      messages: [...messages.slice(-12), { role: "system", content: turnNote }],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ reply: fallback, stage: reask });
    }
    const reply = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    // テレビや周りの声だったときは返事をしない(画面は「もう一度」とだけ出す)
    if (reply.includes(IGNORE_MARK)) return Response.json({ ignored: true, stage: reask });
    return Response.json({ reply: reply || fallback, stage: reask });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("API キーが正しくありません");
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error("API の利用上限に達しました");
    } else if (error instanceof Anthropic.APIError) {
      console.error(`API エラー ${error.status}:`, error.message);
    } else {
      console.error(error);
    }
    return Response.json({ reply: fallback, stage: reask, error: true }, { status: 502 });
  }
}
