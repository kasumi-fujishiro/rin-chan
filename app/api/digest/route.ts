import Anthropic from "@anthropic-ai/sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveProfile } from "../../lib/profile";

// 会話の区切り(30分話さなかったとき)に、今日これまでの話を短いメモにする。
// 急がない処理なので Sonnet を使う。メモは iPad にだけ残し、サーバーには置かない
const MODEL = "claude-sonnet-5-5";
const MAX_CHARS = 500;

type DigestRequest = {
  turns?: { role: "user" | "assistant"; content: string }[];
  // ここまでの今日のメモ
  previous?: string;
  profile?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as DigestRequest;
  const { profile } = resolveProfile(body.profile);
  const env = getCloudflareContext().env as Record<string, string | undefined>;
  const previous = typeof body.previous === "string" ? body.previous.slice(0, MAX_CHARS) : "";
  const turns = (body.turns ?? []).slice(-40);
  if (turns.length === 0) return Response.json({ summary: previous });

  const system = `${profile.userCallName}と${profile.assistantName}の今日の会話を、次の会話で流れを続けるためのメモにします。
- 「今日のメモ」があれば、新しい会話の内容を足して1つにまとめ直します
- 全部で6行まで、1行は短く。各行の先頭に「本人の話:」「家族から:」「聞かれたこと:」のどれかを付けます
- 「本人の話:」は${profile.userCallName}が話したことで、事実かどうかは分かりません。事実として書きません
- 「家族から:」は「(ご家族が伝えたいこと:…)」「(…からの伝言を聞きました:…)」の内容です
- 「聞かれたこと:」は聞かれた内容だけを書き、回数や、忘れたことへの評価は書きません
- 診断や評価、体調の判断は書きません。話がなければ「なし」とだけ書きます`;

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [
        {
          role: "user",
          content: `# 今日のメモ\n${previous || "(なし)"}\n\n# 新しい会話\n${turns
            .map((t) => `${t.role === "user" ? "話しかけ" : profile.assistantName}:${t.content}`)
            .join("\n")}`,
        },
      ],
    });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (response.stop_reason === "refusal" || !text) return Response.json({ summary: previous });
    return Response.json({ summary: text === "なし" ? previous : text.slice(0, MAX_CHARS) });
  } catch (error) {
    console.error(error);
    // まとめられなくても、前のメモは残す
    return Response.json({ summary: previous, error: true }, { status: 502 });
  }
}
