/**
 * 外部数据源 ID 映射
 *
 * 本项目内部用可读的 slug（"tron"）标识项目，而两个等待时间数据源各用自己的 ID：
 *   - themeparks.wiki  → UUID，如 "72d2c957-0280-4bfa-b2fc-5c70913a613b"
 *   - Queue-Times.com  → 数字，如 2985
 *
 * 没有这张表，接口返回的等待时间无法与内部项目对齐，实时数据会被静默丢弃。
 * 表中的 ID 来自两个数据源的实时接口，按官方英文名逐条核对：
 *   curl https://api.themeparks.wiki/v1/entity/<parkUuid>/children
 *   curl https://queue-times.com/parks/30/queue_times.json
 *
 * 值为 null 表示该数据源尚未收录（演出、巡游，或新开项目），此时回退到预测值。
 */

export type ProviderIds = {
  /** themeparks.wiki entity UUID */
  themeparks: string | null;
  /** Queue-Times.com ride id */
  queueTimes: number | null;
  /** Queue-Times.com 单人快速通道队列 id（若该项目提供 Single Rider） */
  queueTimesSingleRider?: number;
};

/** 上海迪士尼：内部 slug → 各数据源 ID。注释为数据源侧的官方英文名。 */
export const SHANGHAI_PROVIDER_IDS: Record<string, ProviderIds> = {
  // ─── 明日世界 ───────────────────────────────────────────────────────────
  "tron":              { themeparks: "72d2c957-0280-4bfa-b2fc-5c70913a613b", queueTimes: 2985 },  // TRON Lightcycle Power Run
  "buzz-lightyear":    { themeparks: "8a7b5eb4-9e3e-463b-af65-395b392ebc6f", queueTimes: 2999 },  // Buzz Lightyear Planet Rescue
  "jet-packs":         { themeparks: "1eb2a711-ab84-4bbf-b351-ce2668861cd5", queueTimes: 3000 },  // Jet Packs

  // ─── 梦幻世界 ───────────────────────────────────────────────────────────
  "seven-dwarfs":      { themeparks: "d0e8c1f9-1fab-4081-bb7d-920815f28aa3", queueTimes: 2990, queueTimesSingleRider: 13818 }, // Seven Dwarfs Mine Train
  "peter-pan":         { themeparks: "75aaf016-29ce-4a74-b5c2-d25876d34a6a", queueTimes: 2989 },  // Peter Pan's Flight
  "winnie":            { themeparks: "8dede135-9a2e-4fb1-9470-4e493c96db9c", queueTimes: 2991 },  // The Many Adventures of Winnie the Pooh
  "carousel":          { themeparks: "a5d3aff4-6f33-4347-bb95-cd58c34eacc1", queueTimes: 2994 },  // Fantasia Carousel
  "dumbo":             { themeparks: "57505d8a-1b5d-490e-82bd-1edf38505bfe", queueTimes: 2993 },  // Dumbo the Flying Elephant
  "fantasy-tale":      { themeparks: "ac0f3ca2-baa5-40b7-a579-f3c822b5b396", queueTimes: 3080 },  // "Once Upon a Time" Adventure
  "alice-maze":        { themeparks: "ecd7c9fe-bcf1-4401-8c1a-287eb5ac3f4c", queueTimes: 2987 },  // Alice in Wonderland Maze
  "crystal-grotto":    { themeparks: "73d08894-9a00-49ee-bd4a-9fb0979d9a65", queueTimes: 2992 },  // Voyage to the Crystal Grotto

  // ─── 探险岛 ─────────────────────────────────────────────────────────────
  "soaring":           { themeparks: "4c72fb0a-b1b1-409b-8d7b-7182e95ac237", queueTimes: 3002 },  // Soaring Over the Horizon
  "roaring-rapids":    { themeparks: "af87332e-f54c-401a-abbd-d1560e173018", queueTimes: 2986 },  // Roaring Rapids
  "exploration-trail": { themeparks: "a7161ee0-90b5-42be-bc10-e2b8010fe7e7", queueTimes: 3893 },  // Challenge Trails at Camp Discovery
  "canoe":             { themeparks: "eef91f74-0d4e-4f58-bdc9-3236306f6707", queueTimes: 2995 },  // Explorer Canoes

  // ─── 宝藏湾 ─────────────────────────────────────────────────────────────
  "pirates":           { themeparks: "87e0fa71-e0e2-4af9-a175-3569b7880680", queueTimes: 2996 },  // Pirates of the Caribbean

  // ─── 迪士尼·皮克斯玩具总动员 ────────────────────────────────────────────
  // 注意：以下两条的 slug 与项目名历史上就是错位的（slug 沿用至今以免破坏已持久化的用户数据），
  // 映射按真实项目名对齐，而非按 slug 字面。
  "dragon":            { themeparks: "00e7ba97-02f1-408e-8cdc-48836b260b92", queueTimes: 5633 },  // Rex's Racer（抱抱龙冲天赛车）
  "slinky-dash":       { themeparks: "709e7684-57b3-4502-a358-f59673239854", queueTimes: 5635 },  // Woody's Roundup（胡迪牛仔嘉年华）
  "alien-pizza":       { themeparks: "6d4f514e-1557-4d7b-942a-83454650365c", queueTimes: 5634 },  // Slinky Dog Spin（弹簧狗团团转）

  // ─── 疯狂动物城 ─────────────────────────────────────────────────────────
  "zootopia-ride":     { themeparks: "1bdf8715-64fd-4353-a1ad-5fe9b1591973", queueTimes: 12392, queueTimesSingleRider: 13819 }, // Zootopia: Hot Pursuit

  // ─── 两个数据源均未收录 ─────────────────────────────────────────────────
  "frozen":            { themeparks: null, queueTimes: null },  // 冰雪奇缘：极境之旅，数据源尚未收录
  "stormy-jack":       { themeparks: null, queueTimes: null },  // 特技表演，非排队制
  "stunt-show":        { themeparks: null, queueTimes: null },  // 特技表演，非排队制
  "mickey-show":       { themeparks: null, queueTimes: null },  // 巡游，非排队制
};

const PROVIDER_IDS_BY_PARK: Record<string, Record<string, ProviderIds>> = {
  shanghai: SHANGHAI_PROVIDER_IDS,
};

function buildReverse(
  parkId: string,
  pick: (ids: ProviderIds) => string | number | null | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [rideId, ids] of Object.entries(PROVIDER_IDS_BY_PARK[parkId] ?? {})) {
    const external = pick(ids);
    if (external != null) map.set(String(external), rideId);
  }
  return map;
}

const reverseCache = new Map<string, Map<string, string>>();

function reverse(parkId: string, provider: "themeparks" | "queueTimes"): Map<string, string> {
  const key = `${parkId}:${provider}`;
  let cached = reverseCache.get(key);
  if (!cached) {
    cached =
      provider === "themeparks"
        ? buildReverse(parkId, (ids) => ids.themeparks)
        : buildReverse(parkId, (ids) => ids.queueTimes);
    reverseCache.set(key, cached);
  }
  return cached;
}

/** themeparks.wiki 的 entity UUID → 内部 slug；未收录返回 null。 */
export function rideIdFromThemeparks(parkId: string, externalId: string): string | null {
  return reverse(parkId, "themeparks").get(externalId) ?? null;
}

/** Queue-Times 的数字 id → 内部 slug；未收录返回 null。 */
export function rideIdFromQueueTimes(parkId: string, externalId: number | string): string | null {
  return reverse(parkId, "queueTimes").get(String(externalId)) ?? null;
}

/** 内部 slug → 各数据源 ID。 */
export function providerIdsForRide(parkId: string, rideId: string): ProviderIds | null {
  return PROVIDER_IDS_BY_PARK[parkId]?.[rideId] ?? null;
}
