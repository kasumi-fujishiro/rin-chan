import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { resolveProfile } from "../../lib/profile";
import { KINDS, type Kind } from "../../lib/types";

// 「あれ」「あの」が何を指すかの推測。返事の速さを優先して Haiku を使う
const MODEL = "claude-haiku-5-5";

const Guess = z.object({
  kind: z.enum(["物", "人", "場所", "不明"]),
  candidates: z.array(z.string()),
});

type GuessRequest = {
  heard: string;
  // 直前の会話(新しいものが最後)
  recent: { role: "user" | "assistant"; content: string }[];
  profile?: unknown;
  // 本人が3つのボタンで種類を選んだとき
  kind?: Kind;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GuessRequest;
  const { profile } = resolveProfile(body.profile);
  const env = getCloudflareContext().env as Record<string, string | undefined>;
  const chosenKind = body.kind && KINDS.includes(body.kind) ? body.kind : undefined;

  const manual = profile.manual.filter((m) => !chosenKind || m.kind === chosenKind);
  if (manual.length === 0) return Response.json({ kind: chosenKind ?? "不明", candidates: [] });

  const now = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const recent = (body.recent ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? profile.userCallName : profile.assistantName}:${m.content}`)
    .join("\n");

  const system = `あなたは、もの忘れが増えた${profile.userCallName}の「あれ」「あの」が何を指しているかを推測する係です。
下の「登録されているもの」の中からだけ選びます。登録にないものは選びません。
時間帯、直前の会話、言いかけた言葉の手がかりから、当てはまりそうな順に最大3つまで名前をそのまま返します。
直前の会話の中の「(ご家族が伝えたいこと:…)」「(…からの伝言を聞きました:…)」は、本人ではなく家族の言葉です。家族が話題にしたものは、本人の「あれ」が指している手がかりとして重く見ます。
${chosenKind ? `${profile.userCallName}は「${chosenKind}」だと教えてくれました。` : "種類(物・人・場所)がはっきりしないときは kind を「不明」にし、それでも候補があれば返します。"}

# ${profile.userCallName}の言い方
${profile.words.map((w) => `- 「${w.say}」は「${w.means}」`).join("\n") || "- (登録なし)"}

# 登録されているもの
${manual.map((m) => `- [${m.kind}] ${m.name}:${m.note}`).join("\n")}`;

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(Guess) },
      system,
      messages: [
        {
          role: "user",
          content: `今は ${now} です。\n# 直前の会話\n${recent || "(なし)"}\n\n# いま${profile.userCallName}が言ったこと\n${body.heard}`,
        },
      ],
    });
    const guess = response.parsed_output;
    if (!guess) return Response.json({ kind: chosenKind ?? "不明", candidates: [] });
    // 登録にある名前だけを残す(念のため)
    const names = new Set(manual.map((m) => m.name));
    return Response.json({
      kind: chosenKind ?? guess.kind,
      candidates: [...new Set(guess.candidates)].filter((n) => names.has(n)).slice(0, 3),
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`API エラー ${error.status}:`, error.message);
    else console.error(error);
    return Response.json({ kind: chosenKind ?? "不明", candidates: [], error: true }, { status: 502 });
  }
}
