import "server-only";
import sample from "../../samples/profile.json";
import { KINDS, type Profile } from "./types";

const SAMPLE = sample as Profile;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 家族の情報はサーバーに置かず、iPad から毎回受け取る。
// 受け取ったものは長さをそろえて使い、どこにも保存しない。登録がなければ架空のサンプルで動かす
export function resolveProfile(input: unknown): { profile: Profile; source: "ipad" | "sample" } {
  if (!input || typeof input !== "object") return { profile: SAMPLE, source: "sample" };
  const p = input as Partial<Record<keyof Profile, unknown>>;
  const words = Array.isArray(p.words) ? p.words : [];
  const manual = Array.isArray(p.manual) ? p.manual : [];
  return {
    source: "ipad",
    profile: {
      assistantName: text(p.assistantName, 20) || SAMPLE.assistantName,
      userCallName: text(p.userCallName, 20) || "あなた",
      familyCallName: text(p.familyCallName, 20) || "ご家族",
      words: words.slice(0, 100).map((w) => ({ say: text(w?.say, 30), means: text(w?.means, 60) })),
      manual: manual
        .slice(0, 200)
        .filter((m) => KINDS.includes(m?.kind))
        .map((m) => ({ kind: m.kind, name: text(m.name, 40), note: text(m.note, 400) })),
      memories: (Array.isArray(p.memories) ? p.memories : [])
        .slice(0, 50)
        .map((m) => ({ title: text(m?.title, 40), note: text(m?.note, 600) }))
        .filter((m) => m.title),
    },
  };
}
