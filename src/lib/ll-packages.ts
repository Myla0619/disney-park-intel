/**
 * 上海迪士尼优速通套餐配置
 * 数据来源：上海迪士尼度假区官方网站 2024-2025
 */

import { LLPackageConfig } from "@/types";

// 所有可购买尊享卡的项目 ID（14个）
export const LL_ELIGIBLE_RIDES = [
  "soaring",           // 翱翔·飞越地平线 102cm+
  "tron",              // 创极速光轮 122cm+
  "roaring-rapids",    // 雷鸣山漂流 107cm+
  "seven-dwarfs",      // 七个小矮人矿山车 97cm+
  "zootopia-ride",     // 疯狂动物城：热力追踪 81cm+（实际无限制）
  "pirates",           // 加勒比海盗 无限制
  "peter-pan",         // 小飞侠天空奇遇 无限制
  "buzz-lightyear",    // 巴斯光年星际营救 无限制
  "crystal-grotto",    // 晶彩奇航 无限制
  "winnie",            // 小熊维尼历险记 无限制
  "dragon",            // 抱抱龙冲天赛车 120cm+
  "slinky-dash",       // 胡迪牛仔嘉年华 无限制（实际81cm）
  "exploration-trail", // 古迹探索营绳索挑战道 106cm+
  "dumbo",             // 小飞象 无限制
];

export const LL_PACKAGES: LLPackageConfig[] = [
  {
    id: "none",
    name: "不购买",
    price: "免费",
    rides: [],
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "普通散客排队",
  },
  {
    id: "single",
    name: "单项尊享卡",
    price: "80–180元/项",
    rides: LL_ELIGIBLE_RIDES,
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "自选单个项目，当日单次使用，指定时段入场",
  },
  {
    id: "bundle3",
    name: "3项尊享套餐",
    price: "399元",
    rides: LL_ELIGIBLE_RIDES, // 任选3个
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "任选3个尊享卡项目，399元打包价",
  },
  {
    id: "bundle6-kids",
    name: "6项童趣套餐",
    price: "约815元",
    rides: ["soaring","pirates","winnie","peter-pan","slinky-dash","crystal-grotto"],
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "翱翔·飞越地平线、加勒比海盗、小熊维尼、小飞侠、胡迪牛仔嘉年华、晶彩奇航",
  },
  {
    id: "bundle6-adv",
    name: "6项探险套餐",
    price: "约815元",
    rides: ["zootopia-ride","seven-dwarfs","tron","buzz-lightyear","exploration-trail","roaring-rapids"],
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "热力追踪、七个小矮人、创极速光轮、巴斯光年、绳索挑战道、雷鸣山漂流",
  },
  {
    id: "bundle6-fun",
    name: "6项畅玩套餐",
    price: "约815元",
    rides: ["zootopia-ride","pirates","slinky-dash","crystal-grotto","buzz-lightyear","dumbo"],
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "热力追踪、加勒比海盗、胡迪牛仔嘉年华、晶彩奇航、巴斯光年、小飞象",
  },
  {
    id: "bundle8",
    name: "8项畅玩套餐",
    price: "799–1160元",
    rides: ["zootopia-ride","soaring","tron","roaring-rapids","pirates","peter-pan","crystal-grotto","buzz-lightyear"],
    hasReservedParade: false,
    hasReservedFireworks: false,
    hasVIPEntrance: false,
    unlimited: false,
    description: "热力追踪、飞越地平线、创极速、雷鸣山、加勒比海盗、小飞侠、晶彩奇航、巴斯光年",
  },
  {
    id: "premium9",
    name: "9项臻享套餐",
    price: "约1200–1500元",
    rides: ["soaring","roaring-rapids","tron","buzz-lightyear","peter-pan","seven-dwarfs","crystal-grotto","pirates","zootopia-ride"],
    hasReservedParade: true,
    hasReservedFireworks: true,
    hasVIPEntrance: true,
    unlimited: false,
    description: "9个热门项目+迪士尼小镇快速入园+花车预留观赏区+烟花预留观赏区",
  },
  {
    id: "premium13",
    name: "13项臻享套餐",
    price: "约1800–2500元",
    rides: ["soaring","roaring-rapids","tron","buzz-lightyear","peter-pan","seven-dwarfs","crystal-grotto","pirates","zootopia-ride","winnie","dragon","slinky-dash","exploration-trail"],
    hasReservedParade: true,
    hasReservedFireworks: true,
    hasVIPEntrance: true,
    unlimited: false,
    description: "13个热门项目+快速入园+花车预留区+烟花预留区",
  },
  {
    id: "concierge11",
    name: "礼宾11项臻享",
    price: "约1500–2000元",
    rides: ["crystal-grotto","buzz-lightyear","peter-pan","pirates","roaring-rapids","tron","seven-dwarfs","soaring","zootopia-ride","winnie","slinky-dash"],
    hasReservedParade: true,
    hasReservedFireworks: true,
    hasVIPEntrance: true,
    unlimited: false,
    description: "11项+礼宾专属服务+快速入园+花车/烟花专属预留观赏区",
  },
  {
    id: "vip33",
    name: "33VIP 尊享导览",
    price: "2688元起（含门票）",
    rides: LL_ELIGIBLE_RIDES,
    hasReservedParade: true,
    hasReservedFireworks: true,
    hasVIPEntrance: true,
    unlimited: true,
    description: "全部14项无限次快通+专属入园通道+花车C位+烟花最佳位+专属导游，3人起订",
  },
];

export function getPackageById(id: string): LLPackageConfig | undefined {
  return LL_PACKAGES.find((p) => p.id === id);
}

// 根据套餐和自选项目，返回该用户有快通的所有项目ID
export function getUserLLRides(profile: {
  llPackage: string;
  singlePassRides: string[];
  bundle3Rides: string[];
}): string[] {
  const pkg = getPackageById(profile.llPackage);
  if (!pkg) return [];
  if (pkg.id === "single") return profile.singlePassRides;
  if (pkg.id === "bundle3") return profile.bundle3Rides;
  return pkg.rides;
}

// 该用户是否有预留位
export function hasReservedSpot(llPackage: string): boolean {
  const pkg = getPackageById(llPackage);
  return pkg?.hasReservedParade ?? false;
}
