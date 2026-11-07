"use client";

import sample from "../../samples/profile.json";
import { DEFAULT_SETTINGS, deleteEntry, getSettings, listEntries, putEntry, saveSettings, type Entry } from "./familyStore";
import type { Kind } from "./types";

// 審査やお試しのための架空のサンプル。写真の代わりに、ここで描いた簡単な絵を使う(本物の家や人は使わない)。
// 入れたブラウザの中にだけ保存され、ほかの iPad には影響しない
export const SAMPLE_PREFIX = "sample-";

const frame = (body: string, bg = "#FFF6E8") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><rect width="400" height="300" fill="${bg}"/>${body}</svg>`;

const PICTURES: Record<string, string> = {
  // 居間:左に棚、真ん中にテーブル、右にテレビ
  room: frame(
    `<rect y="210" width="400" height="90" fill="#D9B98C"/>
     <rect x="20" y="70" width="90" height="150" fill="#9C6B3F"/><rect x="28" y="110" width="74" height="6" fill="#7A5230"/><rect x="28" y="160" width="74" height="6" fill="#7A5230"/>
     <rect x="40" y="92" width="22" height="18" rx="3" fill="#E8D5A8"/>
     <ellipse cx="200" cy="215" rx="95" ry="22" fill="#8A5A34"/><rect x="190" y="225" width="20" height="45" fill="#6E4527"/>
     <rect x="186" y="198" width="34" height="14" rx="6" fill="#3B6FB6"/>
     <rect x="290" y="110" width="90" height="62" rx="6" fill="#2E2E2E"/><rect x="298" y="118" width="74" height="46" fill="#5C7A99"/><rect x="315" y="172" width="40" height="38" fill="#7A5230"/>
     <text x="200" y="40" font-size="26" text-anchor="middle" fill="#7A5230" font-family="sans-serif">居間(サンプル)</text>`,
  ),
  glasses: frame(
    `<rect x="70" y="190" width="260" height="60" rx="28" fill="#3B6FB6"/>
     <circle cx="150" cy="140" r="48" fill="#E9F2FB" stroke="#2B2B2B" stroke-width="10"/>
     <circle cx="250" cy="140" r="48" fill="#E9F2FB" stroke="#2B2B2B" stroke-width="10"/>
     <path d="M198 132 Q200 120 202 132" stroke="#2B2B2B" stroke-width="10" fill="none"/>
     <path d="M102 128 L60 110 M298 128 L340 110" stroke="#2B2B2B" stroke-width="10" stroke-linecap="round"/>`,
  ),
  toothpicks: frame(
    `<rect x="150" y="130" width="100" height="120" rx="14" fill="#C98B4A"/>
     ${[160, 175, 190, 205, 220, 235].map((x, i) => `<line x1="${x}" y1="135" x2="${x - 12 + i * 5}" y2="55" stroke="#E8D5A8" stroke-width="6" stroke-linecap="round"/>`).join("")}`,
  ),
  microwave: frame(
    `<rect x="60" y="70" width="280" height="170" rx="16" fill="#E6E6E6" stroke="#9A9A9A" stroke-width="6"/>
     <rect x="80" y="90" width="170" height="130" rx="10" fill="#4A4A4A"/>
     <rect x="270" y="95" width="50" height="22" rx="4" fill="#2E2E2E"/>
     <circle cx="295" cy="190" r="22" fill="#E57A3C"/><text x="295" y="230" font-size="14" text-anchor="middle" fill="#555" font-family="sans-serif">あたため</text>`,
  ),
  heater: frame(
    `<rect x="110" y="50" width="180" height="200" rx="14" fill="#F2F2F2" stroke="#9A9A9A" stroke-width="6"/>
     <rect x="135" y="75" width="130" height="60" rx="6" fill="#2F4B3A"/><text x="200" y="115" font-size="30" text-anchor="middle" fill="#9CF2B8" font-family="sans-serif">40℃</text>
     <circle cx="150" cy="200" r="20" fill="#D94A4A"/><circle cx="200" cy="200" r="14" fill="#9A9A9A"/><circle cx="245" cy="200" r="14" fill="#9A9A9A"/>`,
  ),
  mother: frame(
    `<circle cx="200" cy="120" r="55" fill="#F1C9A5"/>
     <path d="M140 110 Q200 30 260 110 L262 95 Q200 20 138 95 Z" fill="#5A3A28"/>
     <circle cx="182" cy="122" r="5" fill="#2B2B2B"/><circle cx="218" cy="122" r="5" fill="#2B2B2B"/>
     <path d="M184 145 Q200 156 216 145" stroke="#B5523B" stroke-width="4" fill="none"/>
     <path d="M110 300 Q120 190 200 185 Q280 190 290 300 Z" fill="#E28E8E"/>`,
    "#EAF3FB",
  ),
  bakery: frame(
    `<rect x="70" y="90" width="260" height="170" fill="#F5E1C0" stroke="#A77A4A" stroke-width="6"/>
     <path d="M60 95 L200 40 L340 95 Z" fill="#C0583C"/>
     <rect x="95" y="150" width="120" height="80" fill="#BFDDF2" stroke="#A77A4A" stroke-width="5"/>
     <rect x="240" y="150" width="60" height="110" fill="#A77A4A"/>
     <ellipse cx="150" cy="200" rx="26" ry="16" fill="#E8B04A"/>
     <text x="200" y="132" font-size="22" text-anchor="middle" fill="#7A5230" font-family="sans-serif">パン屋さん</text>`,
    "#EAF3FB",
  ),
};

const picture = (key: string) => new Blob([PICTURES[key]], { type: "image/svg+xml" });

type SampleItem = { name: string; kind: Kind; picture: string; spot?: { x: number; y: number } };
const PICTURE_OF: Record<string, SampleItem> = {
  眼鏡: { name: "眼鏡", kind: "物", picture: "glasses", spot: { x: 0.51, y: 0.68 } },
  つまようじ: { name: "つまようじ", kind: "物", picture: "toothpicks", spot: { x: 0.13, y: 0.34 } },
  電子レンジ: { name: "電子レンジ", kind: "物", picture: "microwave" },
  給湯器: { name: "給湯器", kind: "物", picture: "heater" },
  お母さん: { name: "お母さん", kind: "人", picture: "mother" },
  パン屋さん: { name: "パン屋さん", kind: "場所", picture: "bakery" },
};

export const hasSample = (entries: Entry[]) => entries.some((e) => e.id.startsWith(SAMPLE_PREFIX));

// サンプルを入れる。ご家族の登録がある項目は上書きしない
export async function loadSampleData() {
  const now = Date.now();
  const roomId = `${SAMPLE_PREFIX}room`;
  await putEntry({ id: roomId, kind: "場所", name: "居間", note: "テレビとテーブルのある部屋です。", photo: picture("room"), updatedAt: now });
  for (const m of sample.manual) {
    const item = PICTURE_OF[m.name];
    await putEntry({
      id: `${SAMPLE_PREFIX}${m.name}`,
      kind: m.kind as Kind,
      name: m.name,
      note: m.note,
      photo: item ? picture(item.picture) : undefined,
      spot: item?.spot ? { roomId, ...item.spot } : undefined,
      updatedAt: now,
    });
  }
  const current = (await getSettings()) ?? DEFAULT_SETTINGS;
  await saveSettings({
    ...current,
    userCallName: current.userCallName || sample.userCallName,
    familyCallName:
      current.familyCallName && current.familyCallName !== DEFAULT_SETTINGS.familyCallName
        ? current.familyCallName
        : sample.familyCallName,
    words: current.words.length ? current.words : sample.words,
    memories: current.memories?.length ? current.memories : sample.memories,
  });
}

// サンプルの登録だけを消す(呼び名などはそのまま残す)
export async function removeSampleData() {
  for (const e of await listEntries()) if (e.id.startsWith(SAMPLE_PREFIX)) await deleteEntry(e.id);
}
