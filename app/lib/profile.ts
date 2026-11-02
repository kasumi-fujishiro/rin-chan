import "server-only";
import sample from "../../samples/profile.json";

export type ManualEntry = { kind: "物" | "人" | "場所"; name: string; note: string };

export type Profile = {
  assistantName: string;
  userCallName: string;
  familyCallName: string;
  words: { say: string; means: string }[];
  manual: ManualEntry[];
};

// 本物の呼び名や家族の情報はリポジトリに入れない。
// 本番は secret の RIN_PROFILE_JSON、開発中は private/profile.json、どちらもなければ架空のサンプル
export async function loadProfile(
  profileJson?: string,
): Promise<{ profile: Profile; source: string }> {
  if (profileJson) {
    return { profile: JSON.parse(profileJson), source: "secret" };
  }
  if (process.env.NODE_ENV === "development") {
    try {
      const { readFile } = await import("node:fs/promises");
      const text = await readFile(`${process.cwd()}/private/profile.json`, "utf8");
      return { profile: JSON.parse(text), source: "private" };
    } catch {
      // private/ がなければサンプルで動かす
    }
  }
  return { profile: sample as Profile, source: "sample" };
}
