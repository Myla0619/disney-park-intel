/**
 * 园区地理定位
 *
 * 坐标来自 themeparks.wiki 的实体位置数据：把每个主题区内已建立映射的项目坐标
 * 取质心。米奇大街与奇想花园的项目未全部收录，用区内具名地标（米奇童话专列、
 * 奇想花园见面会、奇幻童话城堡）补齐。
 *
 * 用途是「用户当前在哪个区」的粗定位——只需判断最近的一个区，不需要精确到米。
 * 园区跨度约 1 公里，各区质心间距 200 米以上，手机 GPS 的十几米误差不影响判断。
 */

export type LatLng = { lat: number; lng: number };

/** 主题区质心。数量级：整个园区约 1km × 0.6km。 */
export const AREA_COORDS: Record<string, LatLng> = {
  mickey:    { lat: 31.143748, lng: 121.657098 },
  garden:    { lat: 31.145157, lng: 121.655647 },
  fantasy:   { lat: 31.146592, lng: 121.654776 },
  adventure: { lat: 31.145825, lng: 121.659323 },
  treasure:  { lat: 31.147542, lng: 121.657507 },
  tomorrow:  { lat: 31.143770, lng: 121.653487 },
  toytown:   { lat: 31.145704, lng: 121.652765 },
  zootopia:  { lat: 31.148394, lng: 121.655585 },
};

/**
 * 园区大致边界（含缓冲）。用于判断用户是否真在园内——不在园里就不该把他
 * "定位"到某个主题区，那只会给出误导性的行程起点。
 */
const PARK_BOUNDS = { minLat: 31.138, maxLat: 31.153, minLng: 121.648, maxLng: 121.665 };

/** 两点间大圆距离（米）。 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = p2 - p1;
  const dl = toRad(b.lng - a.lng);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isInsidePark(pos: LatLng): boolean {
  return (
    pos.lat >= PARK_BOUNDS.minLat &&
    pos.lat <= PARK_BOUNDS.maxLat &&
    pos.lng >= PARK_BOUNDS.minLng &&
    pos.lng <= PARK_BOUNDS.maxLng
  );
}

export type AreaFix = {
  areaId: string;
  /** 到该区质心的距离（米） */
  distanceMeters: number;
  /**
   * 定位可信度：
   *   high   —— 明显最近的一个区
   *   medium —— 最近与次近相差不大，可能站在两区交界
   *   low    —— 距离任何区质心都很远
   */
  confidence: "high" | "medium" | "low";
};

/** 不在园内时返回 null，由调用方保留手动选择。 */
export function nearestArea(pos: LatLng): AreaFix | null {
  if (!isInsidePark(pos)) return null;

  const ranked = Object.entries(AREA_COORDS)
    .map(([areaId, coord]) => ({ areaId, distanceMeters: distanceMeters(pos, coord) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const [best, second] = ranked;
  // 两区质心最近间距约 200m，因此 120m 内视为明确落在该区
  const confidence: AreaFix["confidence"] =
    best.distanceMeters > 350
      ? "low"
      : second && second.distanceMeters - best.distanceMeters < 60
      ? "medium"
      : "high";

  return { ...best, confidence };
}
