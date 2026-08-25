#!/usr/bin/env node
/**
 * 从已抓取的小红书语料中提取拍照机位。
 *
 * 拍照机位没有官方数据源——它本质是游客口口相传的经验，因此不能像商店那样从官网
 * 取数。这里改为从 data/reviews/ 里 280 条真实笔记中抽取，每条机位都必须带上
 * 支撑它的原文片段与原帖链接，可追溯、可核对。
 *
 * 硬性约束（写进提示词并在代码侧校验）：
 *   - 只提取笔记里**明确写到**的机位，不补全、不推断、不合并常识
 *   - 每条必须给出原文片段（sourceQuote），且该片段必须真实出现在语料中
 *   - 时段、构图建议同样只能来自原文，没写就留空
 *
 * 用法：
 *   node scripts/extract_photo_spots.mjs --dry-run   # 只统计语料，不调用模型
 *   node scripts/extract_photo_spots.mjs             # 执行提取
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVIEWS_DIR = path.join(ROOT, "data", "reviews");
const OUT = path.join(ROOT, "data", "reference", "photo-spots-extracted.json");

const DRY_RUN = process.argv.includes("--dry-run");

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

const AREAS = {
  mickey: "米奇大街", garden: "奇想花园", fantasy: "梦幻世界",
  adventure: "探险岛", treasure: "宝藏湾", tomorrow: "明日世界",
  toytown: "迪士尼·皮克斯玩具总动员", zootopia: "疯狂动物城",
};

const SPOT_SCHEMA = {
  type: "object",
  properties: {
    spots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "机位名称，尽量沿用笔记里的说法" },
          area: { type: "string", enum: Object.keys(AREAS) },
          bestTimeSlots: {
            type: "array",
            items: { type: "string" },
            description: '笔记中明确提到的时段，格式 "HH:MM-HH:MM"。没写则为空数组',
          },
          bestConditions: { type: "string", description: "光线、天气、人流等条件；没写则为空串" },
          tips: { type: "string", description: "构图或拍摄建议，只能来自原文" },
          photoType: { type: "string", enum: ["landmark", "themed", "interactive", "scenic"] },
          sourceQuote: { type: "string", description: "支撑该机位的原文片段，必须逐字取自笔记" },
          sourceUrl: { type: "string", description: "该笔记的 url 字段" },
        },
        required: ["name", "area", "bestTimeSlots", "bestConditions", "tips", "photoType", "sourceQuote", "sourceUrl"],
        additionalProperties: false,
      },
    },
  },
  required: ["spots"],
  additionalProperties: false,
};

function loadCorpus() {
  if (!existsSync(REVIEWS_DIR)) return [];
  return readdirSync(REVIEWS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(REVIEWS_DIR, f), "utf-8")));
}

async function extractFrom(entry, client) {
  const notes = entry.reviews
    .map((r, i) => `[${i}] ${r.text}\n    url: ${r.url}`)
    .join("\n\n");

  const prompt = `以下是小红书上关于上海迪士尼「${entry.targetId}」的 ${entry.reviews.length} 条真实笔记。

请从中提取**明确提到的拍照机位**。

严格要求：
1. 只提取笔记里真的写到的机位。没有提到拍照地点的笔记就跳过，不要为了凑数而输出。
2. sourceQuote 必须**逐字**取自某条笔记的正文，不得改写、不得拼接多条。
3. bestTimeSlots 只填笔记里明确写出的时段，并归一化为 "HH:MM-HH:MM"。笔记没写时段就返回空数组——不要用常识补。
4. bestConditions 与 tips 同样只能来自原文，没写就留空串。
5. area 必须是给定枚举之一，依据笔记描述的位置判断；判断不了就跳过这条。
6. sourceUrl 填该笔记的 url。

可选区域：
${Object.entries(AREAS).map(([k, v]) => `  ${k} = ${v}`).join("\n")}

笔记：
${notes}`;

  const message = await client.messages.create({
    model: process.env.CLAUDE_EXTRACT_MODEL ?? "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: SPOT_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const usage = message.usage;
  return { parsed: JSON.parse(text), usage };
}

async function main() {
  const corpus = loadCorpus();
  if (!corpus.length) {
    console.error("data/reviews/ 为空，请先运行 scripts/collect_reviews.mjs");
    process.exit(1);
  }

  const total = corpus.reduce((s, c) => s + c.reviews.length, 0);
  console.log(`语料：${corpus.length} 个目标，共 ${total} 条笔记`);
  if (DRY_RUN) {
    for (const c of corpus) console.log(`  ${c.targetId}: ${c.reviews.length} 条`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("缺少 ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const client = new Anthropic();
  const all = [];
  let inTok = 0;
  let outTok = 0;

  for (const entry of corpus) {
    try {
      const { parsed, usage } = await extractFrom(entry, client);
      inTok += usage.input_tokens;
      outTok += usage.output_tokens;

      // 代码侧校验：原文片段必须真实存在于该目标的语料中，杜绝模型编造
      const texts = entry.reviews.map((r) => r.text);
      const verified = parsed.spots.filter((s) => {
        const quote = (s.sourceQuote ?? "").trim();
        if (quote.length < 6) return false;
        return texts.some((t) => t.includes(quote));
      });
      const rejected = parsed.spots.length - verified.length;

      all.push(...verified.map((s) => ({ ...s, fromTarget: entry.targetId })));
      console.log(
        `  ${entry.targetId}: 提取 ${parsed.spots.length} 条，通过原文校验 ${verified.length} 条` +
          (rejected ? `（剔除 ${rejected} 条无法在原文中定位的）` : "")
      );
    } catch (err) {
      console.error(`  ${entry.targetId} 失败: ${err.message}`);
    }
  }

  writeFileSync(OUT, JSON.stringify({ extractedAt: new Date().toISOString(), spots: all }, null, 2) + "\n", "utf-8");

  const cost = (inTok / 1e6) * 5 + (outTok / 1e6) * 25;
  console.log(`\n合计 ${all.length} 条机位（已通过原文校验）→ ${path.relative(ROOT, OUT)}`);
  console.log(`用量：输入 ${inTok} / 输出 ${outTok} tokens，约 $${cost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
