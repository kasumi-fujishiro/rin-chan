import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { resolveProfile } from "../../lib/profile";
import { stripLeadingName } from "../../lib/prompt";

// 家族の言葉を、本人に伝わる形に言い直す。その場のやりとりなので速さを優先して Haiku
const MODEL = "claude-haiku-5-5";

const Relay = z.object({
  // リンちゃんが読み上げる言葉(1〜2文)
  say: z.string(),
  // 画面に大きく出す要点(15文字くらい)
  big: z.string(),
  // 関係する登録があれば、その名前をそのまま。なければ空文字
  entry: z.string(),
});

export async function POST(request: Request) {
  const body = (await request.json()) as {
    heard: string;
    profile?: unknown;
    // 直前の会話(新しいものが最後)
    recent?: { role: "user" | "assistant"; content: string }[];
  };
  const { profile } = resolveProfile(body.profile);
  const env = getCloudflareContext().env as { [key: string]: string | undefined };
  const user = profile.userCallName;

  const system = `あなたは「${profile.assistantName}」です。${user}のそばにいる家族が話した言葉を、${user}に伝わるように言い直す係です。

# 言い直し方
- 家族の言いたいことの意味は変えません。足したり、省いたりしません。
- 短い文で、1〜2文にします。むずかしい言葉は、やさしい言葉にします。
- 命令や強い口調は、やわらかい誘いかけにします。例:「これ食べなさい」→「これ、ひとくち食べませんか。」
- 何度も同じことを言われている場面でも、責める言い方にはしません。
- 呼びかけは画面の側で付けるので、say の最初に呼び名は書きません。やわらかい「です・ます」で話します。読み上げるので記号は使いません。
- 家族の言葉にない事実(場所、時間、理由)は足しません。
- 家族の言葉の「それ」「あれ」「さっきの」が何を指すかは、下の直前の会話にはっきり出ているときだけ、その言葉に置きかえます。はっきりしないときは置きかえません。
- 下の「${user}の言い方」にある物は、必ずその言い方で呼びます(例:「運動靴」ではなく「ズック」)。
- big には、画面に大きく出す要点を15文字くらいで書きます。例:「ごはん ひとくち」「おくすり のみましたか」
- entry には、下の「登録されているもの」の中で、家族の言葉に関係するものの名前をそのまま1つだけ書きます。なければ空にします。

# ${user}の言い方(あなたもこの言い方を使います)
${profile.words.map((w) => `- 「${w.say}」は「${w.means}」`).join("\n") || "- (登録なし)"}

# 登録されているもの
${profile.manual.map((m) => `- [${m.kind}] ${m.name}`).join("\n") || "- (なし)"}`;

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(Relay) },
      system,
      messages: [
        {
          role: "user",
          content: `# 直前の会話\n${
            (body.recent ?? [])
              .slice(-6)
              .map(
                (m) =>
                  `${m.role === "user" ? user : profile.assistantName}:${String(m.content).slice(0, 300)}`,
              )
              .join("\n") || "(なし)"
          }\n\n# 家族が話したこと\n${String(body.heard ?? "").slice(0, 500)}`,
        },
      ],
    });
    const out = response.parsed_output;
    if (response.stop_reason === "refusal" || !out) return Response.json({ error: true }, { status: 502 });
    const names = new Set(profile.manual.map((m) => m.name));
    // 呼びかけは読み上げるときに画面の側で付ける
    return Response.json({
      say: stripLeadingName(out.say, profile),
      big: out.big,
      entry: names.has(out.entry) ? out.entry : null,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`API エラー ${error.status}:`, error.message);
    else console.error(error);
    return Response.json({ error: true }, { status: 502 });
  }
}
