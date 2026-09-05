import {readFileSync,existsSync} from "node:fs";
/**
 * 种子任务生成器
 *
 * Query 多样性四层对策的第 2 层落地：不让 LLM 自由发挥，
 * 用「persona 池 × 约束采样器 × 模板池」组合控制分布，确定性 RNG 可复现。
 *
 * 类别体系对齐 scripts/eval_tool_accuracy.py 的 11 类，外加多约束长程规划。
 * 真实人类语料（第 1 层，占目标 30-50%）从 data/rl/human_queries.jsonl 合入——
 * 该文件由小红书攻略帖/评论区提问（Apify 抓取后改写）人工整理，格式见 README。
 */

import { getRidesByPark, getRestaurants, getPhotoSpots } from "@/lib/parks-data";
import type { UserProfile } from "@/types";

export type SeedTask = {
  id: string;
  parkId: string;
  category: string;
  query: string;
  profile: Partial<UserProfile>;
  source: "template" | "human";
  familyId?: string;
  split?: "train" | "validation" | "test";
  augmentation?: { method: string; model?: string; parentId: string };
  /** 预估难度（按预期工具调用次数）：easy 1-3 / medium 4-10 / hard >10 */
  difficultyHint: "easy" | "medium" | "hard";
};

// 确定性 RNG（mulberry32）：同一 seed 永远生成同一批任务
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];
const maybe = (r: () => number, p: number) => r() < p;

// persona 池（对应真实游客类型分布）
const PERSONAS: { name: string; profile: Partial<UserProfile>; kidHeights?: number[] }[] = [
  { name: "亲子-学龄前", profile: { mode: "family" }, kidHeights: [95, 97, 100, 105] },
  { name: "亲子-小学生", profile: { mode: "family" }, kidHeights: [110, 112, 118, 121, 122, 125] },
  { name: "情侣刺激党", profile: { mode: "thrill", thrillLevel: 5 } },
  { name: "学生特种兵", profile: { mode: "casual", arrivalTime: "07:30", departureTime: "22:00" } },
  { name: "带老人慢节奏", profile: { mode: "casual", mobilityNeeds: true } },
  { name: "摄影打卡", profile: { mode: "photo", focusPhoto: true } },
  { name: "购物收集", profile: { mode: "shopping", focusShopping: true } },
];

const LL_OPTIONS: UserProfile["llPackage"][] = ["none", "none", "single", "bundle3", "bundle8", "premium13", "vip33"];

export function generateSeeds(parkId: string, seed = 20260901): SeedTask[] {
  const r = rng(seed);
  const rides = getRidesByPark(parkId);
  const restaurants = getRestaurants(parkId);
  const photos = getPhotoSpots(parkId);
  const hot = rides.filter((x) => x.tags.includes("must-do"));
  const tasks: SeedTask[] = [];
  let n = 0;
  const add = (category: string, query: string, profile: Partial<UserProfile>, difficultyHint: SeedTask["difficultyHint"]) =>
    tasks.push({ id: `${parkId}-seed-${String(++n).padStart(4, "0")}`, parkId, category, query, profile, source: "template", difficultyHint });

  // 1) explicit_wait ×30：直接问排队
  for (let i = 0; i < 30; i++) {
    const ride = pick(r, rides);
    const t = pick(r, [
      `${ride.name}现在排多久？`,
      `${ride.name}排队时间`,
      `我想玩${ride.name}，现在人多吗`,
      `${ride.name}要等多长时间啊，值得等吗`,
    ]);
    add("explicit_wait", t, {}, "easy");
  }

  // 2) implicit_wait ×20：间接问人少
  for (let i = 0; i < 20; i++) {
    add("implicit_wait", pick(r, [
      "现在哪个项目人最少？",
      "不想排队，有什么马上能玩的",
      "全园现在拥挤吗，平均要排多久",
      "帮我找三个排队短的项目",
      "哪些项目停运了？",
    ]), {}, "easy");
  }

  // 3) review_quality ×25：好不好玩
  for (let i = 0; i < 25; i++) {
    const ride = pick(r, hot.length ? hot : rides);
    add("review_quality", pick(r, [
      `${ride.name}好玩吗？`,
      `${ride.name}值不值得玩`,
      `大家觉得${ride.name}怎么样`,
    ]), {}, "easy");
  }

  // 4) review_specific ×25：特定维度
  for (let i = 0; i < 25; i++) {
    const ride = pick(r, rides);
    const age = 3 + Math.floor(r() * 9);
    add("review_specific", pick(r, [
      `${ride.name}适合${age}岁孩子吗`,
      `${ride.name}吓人吗，恐高能玩吗`,
      `${ride.name}会不会湿身`,
      `${ride.name}晕车的人能坐吗`,
    ]), { kids: [{ age, heightCm: 85 + age * 6 }] }, "easy");
  }

  // 5) plan_request ×60：多约束长程规划（核心难样本）
  for (let i = 0; i < 60; i++) {
    const persona = pick(r, PERSONAS);
    const profile: Partial<UserProfile> = { ...persona.profile };
    const parts: string[] = [];

    if (persona.kidHeights) {
      const h = pick(r, persona.kidHeights);
      profile.kids = [{ age: Math.max(2, Math.round(h / 16)), heightCm: h }];
      parts.push(`带一个身高${h}cm的孩子`);
    }
    if (persona.name === "带老人慢节奏") parts.push("有老人同行走不快");

    const ll = pick(r, LL_OPTIONS);
    profile.llPackage = ll;
    if (ll !== "none") parts.push(pick(r, ["买了优速通", `买了${ll === "vip33" ? "VIP33" : "尊享套餐"}`]));

    profile.arrivalTime = profile.arrivalTime ?? pick(r, ["08:00", "09:00", "10:30", "13:00"]);
    profile.departureTime = profile.departureTime ?? pick(r, ["17:00", "19:00", "21:30", "22:00"]);
    parts.push(`${profile.arrivalTime}入园${profile.departureTime}离园`);

    if (maybe(r, 0.5)) { profile.watchFireworks = true; parts.push("想看烟花"); }
    if (maybe(r, 0.3)) { profile.watchParade = true; parts.push("想看花车巡游"); }
    if (maybe(r, 0.4)) {
      const must = pick(r, hot.length ? hot : rides);
      parts.push(`${must.name}一定要玩到`);
    }
    if (maybe(r, 0.3)) parts.push(pick(r, ["中午想吃顿好的", "随便吃点快餐就行", "想去网红餐厅打卡"]));
    if (maybe(r, 0.25)) parts.push(pick(r, ["不玩太刺激的", "过山车都不敢坐", "水上项目不去"]));

    add("plan_request", `${parts.join("，")}，帮我规划一天行程`, profile, parts.length >= 5 ? "hard" : "medium");
  }

  // 6) spot_info ×25
  for (let i = 0; i < 25; i++) {
    if (maybe(r, 0.5)) {
      const rest = pick(r, restaurants);
      add("spot_info", pick(r, [
        `${rest.name}要预约吗？`,
        `${rest.name}人均多少，有什么推荐`,
        `${rest.name}怎么走，离哪个项目近`,
      ]), {}, "easy");
    } else {
      const p = pick(r, photos);
      add("spot_info", pick(r, [
        `${p.name}几点去拍照最好`,
        `${p.name}怎么去`,
      ]), {}, "easy");
    }
  }

  // 7) no_tool ×15：常识题（不该调工具）
  for (let i = 0; i < 15; i++) {
    add("no_tool", pick(r, [
      "迪士尼可以自己带吃的进园吗",
      "乐园里可以充电吗",
      "门票当天可以退吗",
      "身高怎么算，穿鞋还是脱鞋",
      "下雨天烟花会取消吗（就问一般规律）",
      "寄存行李在哪里",
    ]), {}, "easy");
  }

  // 8) edge_negation ×10：否定句
  for (let i = 0; i < 10; i++) {
    const ride = pick(r, hot.length ? hot : rides);
    add("edge_negation", pick(r, [
      `不用告诉我${ride.name}排多久，就说好不好玩`,
      `别推荐吃的，我就想知道${ride.name}刺激不刺激`,
    ]), {}, "easy");
  }

  // 9) edge_multi_intent ×20：一句话多个意图
  for (let i = 0; i < 20; i++) {
    const a = pick(r, rides); const b = pick(r, restaurants);
    add("edge_multi_intent", pick(r, [
      `${a.name}现在排多久？顺便帮我看看${b.name}值得吃吗`,
      `帮我查下${a.name}的排队和评论，再告诉我${b.name}要不要预约`,
      `${a.name}和${b.name}离得远吗？走过去要多久，路上有什么好玩的`,
    ]), {}, "medium");
  }

  // 10) weather_dependent ×10
  for (let i = 0; i < 10; i++) {
    add("weather_dependent", pick(r, [
      "明天下雨的话还能玩什么",
      "今天天气适合玩漂流吗",
      "下雨烟花会不会取消，帮我查下今天天气",
      "太热了，帮我排个室内项目为主的行程",
    ]), maybe(r, 0.5) ? { mode: "family", kids: [{ age: 6, heightCm: 115 }] } : {}, "medium");
  }

  // 11) trade_off ×25：排队 × 距离 × 好玩度的显式权衡（模型必须查数据再算账）
  for (let i = 0; i < 25; i++) {
    const a = pick(r, hot.length ? hot : rides);
    let b = pick(r, rides);
    while (b.id === a.id) b = pick(r, rides);
    const areaName = pick(r, ["宝藏湾", "明日世界", "梦幻世界", "疯狂动物城", "探险岛"]);
    add("trade_off", pick(r, [
      `${a.name}和${b.name}现在哪个更值得排？帮我算下排队和好玩程度`,
      `我在${areaName}，是就近排${b.name}，还是走过去排${a.name}划算？`,
      `${a.name}排队要是超过一小时就不值了吧？帮我看看现在情况，给个建议`,
      `只剩3小时了，${a.name}和${b.name}只能选一个，考虑排队时间和距离帮我选`,
      `腿快走断了，接下来两小时安排少走路的玩法`,
      `我们是特种兵打卡，排队无所谓就要刷最多项目，怎么排最有效率`,
      `带着老人不想走太多路，但${a.name}又想玩，怎么权衡`,
    ]), maybe(r, 0.3) ? { mobilityNeeds: true } : {}, "medium");
  }

  // 12) edge_name_variant ×10：别名/描述式称呼
  for (let i = 0; i < 10; i++) {
    add("edge_name_variant", pick(r, [
      "那个趴着坐的摩托车过山车排多久",
      "光轮现在人多吗",
      "白雪公主那个过山车适合小孩吗",
      "会淋湿的那个船现在开吗",
      "疯狂动物城那个新项目怎么样",
    ]), {}, "easy");
  }

  return tasks;
}

/** 合入真实人类 query（第 1 层多样性）；文件不存在则跳过 */
export function loadHumanQueries(path: string): SeedTask[] {
  if(!existsSync(path))return [];
  return readFileSync(path, "utf-8")
      .split("\n").filter((l: string) => l.trim())
      .map((l: string, i: number) => {
        const j = JSON.parse(l);
        return {
          id: j.id ?? `human-${String(i + 1).padStart(4, "0")}`,
          parkId: j.parkId ?? "shanghai",
          category: j.category ?? "human",
          query: j.query,
          profile: j.profile ?? {},
          source: "human" as const,
          difficultyHint: j.difficultyHint ?? "medium",
        };
      });
}

/** 第 3 层多样性：字符 3-gram Jaccard 去重（embedding 去重后续升级） */
export function dedup(tasks: SeedTask[], threshold = 0.8): SeedTask[] {
  const grams = (s: string) => {
    const t = s.replace(/\s/g, "");
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const kept: { task: SeedTask; g: Set<string> }[] = [];
  for (const task of tasks) {
    const g = grams(task.query);
    const dup = kept.some(({ task: prior, g: g2 }) => {
      // Similar wording with a different explicit constraint is a distinct task.
      if (prior.category !== task.category || JSON.stringify(prior.profile) !== JSON.stringify(task.profile)) return false;
      let inter = 0;
      for (const x of g) if (g2.has(x)) inter++;
      const union = g.size + g2.size - inter;
      return union > 0 && inter / union > threshold;
    });
    if (!dup) kept.push({ task, g });
  }
  return kept.map((k) => k.task);
}
