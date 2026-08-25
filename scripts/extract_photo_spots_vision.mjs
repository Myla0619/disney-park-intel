#!/usr/bin/env node
/**
 * 从小红书攻略笔记的**图片**中提取拍照机位。
 *
 * 为什么必须走视觉：这类笔记的干货写在图片上（机位示意、时段、光线、构图），
 * 正文常常只剩话题标签，且 search 接口把 bodyText 截断在 85 字符。纯文本提取
 * 在这批语料上拿到的时段信息为零。
 *
 * 防编造的约束与文本版一致：
 *   - 只提取图上**看得见**的信息，看不清就跳过
 *   - 时段、光线条件没写就留空，禁止用常识补
 *   - 每条必须记录来源笔记的链接，可回原帖核对
 *
 * 用法：
 *   node scripts/extract_photo_spots_vision.mjs --limit 12   # 处理前 N 条笔记
 *   node scripts/extract_photo_spots_vision.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data", "reviews", "_photo-spots.json");
const OUT = path.join(ROOT, "data", "reference", "photo-spots-vision.json");

function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const li = args.indexOf("--limit");
const LIMIT = li === -1 ? 12 : Number(args[li + 1]);
/** 每条笔记最多送几张图：首图通常是封面，干货多在第 2-3 张 */
const IMAGES_PER_NOTE = 3;

const AREAS = {
  mickey: "米奇大街", garden: "奇想花园", fantasy: "梦幻世界",
  adventure: "探险岛", treasure: "宝藏湾", tomorrow: "明日世界",
  toytown: "迪士尼·皮克斯玩具总动员", zootopia: "疯狂动物城",
};

const SCHEMA = {
  type: "object",
  properties: {
    spots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "机位名称，沿用图上的说法" },
          area: { type: "string", enum: [...Object.keys(AREAS), "unknown"] },
          bestTimeSlots: { type: "array", items: { type: "string" }, description: '图上写明的时段，"HH:MM-HH:MM"；没写则空数组' },
          bestConditions: { type: "string", description: "光线/天气/人流条件，图上没写则空串" },
          tips: { type: "string", description: "构图、机位、姿势建议，只能来自图上内容" },
          photoType: { type: "string", enum: ["landmark", "themed", "interactive", "scenic"] },
          evidence: { type: "string", description: "图上支撑该条目的可见文字或画面描述" },
        },
        required: ["name", "area", "bestTimeSlots", "bestConditions", "tips", "photoType", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["spots"],
  additionalProperties: false,
};

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`图片 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "image/jpeg";
  const media = type.includes("png") ? "image/png" : type.includes("webp") ? "image/webp" : "image/jpeg";
  return { data: buf.toString("base64"), media };
}

async function extractFromNote(note, client) {
  const images = [];
  for (const url of note.imageUrls.slice(0, IMAGES_PER_NOTE)) {
    try {
      images.push(await fetchImage(url));
    } catch {
      // 单张图取不到不影响其余
    }
  }
  if (!images.length) return { spots: [], usage: null };

  const content = [
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.media, data: img.data },
    })),
    {
      type: "text",
      text: `这是一条小红书上海迪士尼拍照攻略笔记的配图。笔记标题与话题：${note.text.slice(0, 120)}

请从图片中提取**拍照机位**信息。

严格要求：
1. 只提取图上**实际看得见**的信息。图片模糊、无关或看不出机位就返回空数组。
2. bestTimeSlots 只填图上明确写出的时段，归一化为 "HH:MM-HH:MM"。图上没写就返回空数组——不要用常识补。
3. bestConditions 与 tips 同样只能来自图上内容，没有就留空串。
4. area 依据图上标注或可辨认的景物判断；判断不了填 "unknown"。
5. evidence 写明图上是哪句话或哪个画面支撑了这条提取。

可选区域：
${Object.entries(AREAS).map(([k, v]) => `  ${k} = ${v}`).join("\n")}`,
    },
  ];

  const message = await client.messages.create({
    model: process.env.CLAUDE_EXTRACT_MODEL ?? "claude-opus-5",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  });

  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { spots: JSON.parse(text).spots, usage: message.usage };
}

async function main() {
  if (!existsSync(SRC)) {
    console.error("缺少 data/reviews/_photo-spots.json，请先运行 collect_photo_notes.mjs");
    process.exit(1);
  }
  const corpus = JSON.parse(readFileSync(SRC, "utf-8"));
  const notes = corpus.reviews.filter((r) => r.imageUrls?.length).slice(0, LIMIT);

  console.log(`将处理 ${notes.length} 条笔记，每条最多 ${IMAGES_PER_NOTE} 张图`);
  if (DRY_RUN) {
    notes.forEach((n) => console.log(`  👍${n.engagement.likes} ${n.text.slice(0, 40)} (${n.imageUrls.length} 图)`));
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("缺少 ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const client = new Anthropic();
  const all = [];
  let inTok = 0, outTok = 0;

  for (const [i, note] of notes.entries()) {
    try {
      const { spots, usage } = await extractFromNote(note, client);
      if (usage) {
        inTok += usage.input_tokens;
        outTok += usage.output_tokens;
      }
      // 区域判断不出来的条目没有排程价值，直接丢弃
      const usable = spots.filter((s) => s.area !== "unknown" && s.name.trim());
      all.push(...usable.map((s) => ({ ...s, sourceUrl: note.url, sourceLikes: note.engagement.likes })));
      console.log(`  [${i + 1}/${notes.length}] 提取 ${spots.length} 条，可用 ${usable.length} 条`);
    } catch (err) {
      console.error(`  [${i + 1}/${notes.length}] 失败: ${err.message}`);
    }
  }

  writeFileSync(OUT, JSON.stringify({ extractedAt: new Date().toISOString(), spots: all }, null, 2) + "\n", "utf-8");

  const withTime = all.filter((s) => s.bestTimeSlots.length).length;
  const cost = (inTok / 1e6) * 5 + (outTok / 1e6) * 25;
  console.log(`\n合计 ${all.length} 条 → ${path.relative(ROOT, OUT)}`);
  console.log(`  其中带时段标注: ${withTime} 条`);
  console.log(`用量：输入 ${inTok} / 输出 ${outTok} tokens，约 $${cost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
