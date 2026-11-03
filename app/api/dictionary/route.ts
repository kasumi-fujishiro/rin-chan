import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { resolveProfile } from "../../lib/profile";

// 記録の読み解き(要約・分析)なので Sonnet を使う(CLAUDE.md の技術構成)
const MODEL = "claude-sonnet-5-5";

const Suggestions = z.object({
  suggestions: z.array(
    z.object({
      // 言い方:本人独特の呼び方(例:ズック=運動靴) / 取り違え:別の言葉と入れ替わっていそうなもの(例:冷たい↔熱い)
      type: z.enum(["言い方", "取り違え"]),
      say: z.string(),
      means: z.string(),
      // 家族が判断できるよう、どの会話からそう考えたかを短く
      reason: z.string(),
    }),
  ),
});

type Record = {
  at: string;
  heard: string;
  reply: string;
  pick?: { kind: string; candidates: string[]; chosen: string | null };
};

export async function POST(request: Request) {
  const body = (await request.json()) as { records: Record[]; profile?: unknown };
  const { profile } = resolveProfile(body.profile);
  const env = getCloudflareContext().env as { [key: string]: string | undefined };

  const records = (body.records ?? []).slice(-200);
  if (records.length === 0) return Response.json({ suggestions: [] });

  const lines = records
    .map((r) => {
      const time = new Date(r.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
      if (r.pick) {
        return `${time} 本人「${r.heard}」→ 写真で${r.pick.chosen ? `「${r.pick.chosen}」を選んだ` : "選ばなかった"}(候補:${r.pick.candidates.join("・") || "なし"})`;
      }
      return `${time} 本人「${r.heard}」/ リンちゃん「${r.reply}」`;
    })
    .join("\n");

  const system = `あなたは、もの忘れが増えた${profile.userCallName}の家族を手伝う係です。
会話の記録から、${profile.userCallName}の「言葉の辞書」に足すとよさそうな候補を見つけます。

- 「言い方」:${profile.userCallName}独特の呼び方。写真で選んだ記録(言った言葉 → 選んだ写真)が一番の手がかりです。例:「ズック」と言って「運動靴」の写真を選んだ。
- 「取り違え」:別の言葉と入れ替わっていそうなもの。例:お茶が熱いのに「冷たい」と言った。会話の流れから分かるものだけにします。
- 記録から根拠を示せるものだけを挙げます。写真で選んだ言い方は、1回だけでも候補に入れ、reason に「1回だけ」と書きます。会話の流れから推測しただけのものは、reason にそう書きます。
- すでに辞書にあるものは挙げません。病気の診断や評価は書きません。
- reason は家族が読む短い説明にし、日時と言葉を入れます。

# すでにある言葉の辞書
${profile.words.map((w) => `- 「${w.say}」は「${w.means}」`).join("\n") || "- (なし)"}

# 登録されているもの
${profile.manual.map((m) => `- [${m.kind}] ${m.name}`).join("\n") || "- (なし)"}`;

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "medium", format: betaZodOutputFormat(Suggestions) },
      // 安全のための判定で断られたときは、サーバー側で別のモデルにやり直してもらう
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: `# 会話の記録(古い順)\n${lines}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ suggestions: [] });
    }
    const known = new Set(profile.words.map((w) => w.say));
    return Response.json({
      suggestions: response.parsed_output.suggestions.filter((s) => s.say && s.means && !known.has(s.say)).slice(0, 20),
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`API エラー ${error.status}:`, error.message);
    else console.error(error);
    return Response.json({ suggestions: [], error: true }, { status: 502 });
  }
}
