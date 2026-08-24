// ─── 孩子信息（年龄+身高）────────────────────────────────────────────────────
export type KidInfo = {
  age: number;
  heightCm: number;
};

// ─── 优速通套餐类型 ───────────────────────────────────────────────────────────
export type LLPackage =
  | "none"
  | "single"          // 单项尊享卡（自选）
  | "bundle3"         // 3项套餐 399元
  | "bundle6-kids"    // 6项童趣套餐 815元
  | "bundle6-adv"     // 6项探险套餐 815元
  | "bundle6-fun"     // 6项畅玩套餐 815元
  | "bundle8"         // 8项畅玩套餐 799-1160元
  | "premium9"        // 9项臻享 1200-1500元
  | "premium13"       // 13项臻享 1800-2500元
  | "concierge11"     // 礼宾11项 1500-2000元
  | "vip33";          // 33VIP 2688元+

// ─── 用户档案 ─────────────────────────────────────────────────────────────────
export type UserProfile = {
  mode: "family" | "thrill" | "casual" | "photo" | "shopping";
  kids: KidInfo[];
  thrillLevel: 1 | 2 | 3 | 4 | 5;
  arrivalTime: string;
  departureTime: string;
  mobilityNeeds: boolean;
  llPackage: LLPackage;
  singlePassRides: string[];   // 单项尊享卡时用户自选的项目
  bundle3Rides: string[];      // 3项套餐用户自选的3个项目
  watchParade: boolean;
  paradeTime: string;
  watchFireworks: boolean;
  fireworksTime: string;
  visitDate: string;
  park: string;
  routeProfile: "efficient" | "balanced" | "easy";
  diningPreference: "quick" | "normal" | "fancy";
  focusPhoto: boolean;
  focusShopping: boolean;
  selectedRestaurants: string[];
};

// ─── 优速通套餐配置 ───────────────────────────────────────────────────────────
export type LLPackageConfig = {
  id: LLPackage;
  name: string;
  price: string;
  rides: string[];         // 包含的项目ID
  hasReservedParade: boolean;
  hasReservedFireworks: boolean;
  hasVIPEntrance: boolean;
  unlimited: boolean;
  description: string;
};

export type ParkArea = {
  id: string;
  name: string;
  emoji: string;
};

export type Ride = {
  id: string;
  name: string;
  parkId: string;
  area: string;
  areaName: string;
  type: "coaster" | "dark" | "boat" | "simulator" | "spinner" | "show" | "drop";
  heightRequirement: number | null;
  thrillScore: 1 | 2 | 3 | 4 | 5;
  kidsScore: 1 | 2 | 3 | 4 | 5;
  waitTime: number | null;
  rideDuration: number;
  llEligible: boolean;     // 是否可购买尊享卡
  singleRider: boolean;
  tags: string[];
  description: string;
};

export type PhotoSpot = {
  id: string;
  name: string;
  parkId: string;
  area: string;
  areaName: string;
  nearestRide: string;
  walkFromNearestRide: number;
  bestTimeSlots: string[];
  bestConditions: string;
  tags: string[];
  tips: string;
  xhsKeyword: string;
  duration: number;
  photoType: "landmark" | "themed" | "interactive" | "scenic";
};

export type ShopSpot = {
  id: string;
  name: string;
  parkId: string;
  area: string;
  areaName: string;
  theme: string;
  /** 官方列出的商品品类 */
  categories: string[];
  /** 店面规模，由官方品类数推导：品类越多可逛内容越多 */
  scale: "flagship" | "major" | "small" | "kiosk";
  hasLimitedEdition: boolean;
  bestTimeToVisit: "opening" | "anytime" | "before-closing";
  duration: number;
  tags: string[];
  tips: string;
};

export type RestaurantReview = {
  author: string;
  source: "xiaohongshu" | "tripadvisor" | "weibo";
  rating: number;
  text: string;
  tags: string[];
};

export type Restaurant = {
  id: string;
  name: string;
  parkId: string;
  area: string;
  areaName: string;
  type: "quick" | "normal" | "fancy";
  requiresReservation: boolean;
  reservationTips?: string;
  cuisine: string;
  priceRange: "¥" | "¥¥" | "¥¥¥";
  duration: number;
  bestMealTime: ("breakfast" | "lunch" | "dinner" | "snack")[];
  suitableModes: string[];
  rating: number;
  reviews: RestaurantReview[];
  tags: string[];
  tips: string;
  photoWorthy: boolean;
};

export type LiveWaitData = {
  rideId: string;
  waitMinutes: number | null;
  status: "operating" | "down" | "closed" | "refurbishment";
  lastUpdated: string;
};

export type HistoricalWaitData = {
  rideId: string;
  predictedWait: number;
  confidence: "high" | "medium" | "low";
  basis: string;
};

export type Review = {
  source: "xiaohongshu" | "tripadvisor" | "google" | "weibo";
  author: string;
  rating: number;
  text: string;
  date: string;
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
  url?: string;
  /** 抓取时间（ISO 8601）。示例数据没有这个字段，据此可区分真实语料与降级内容。 */
  scrapedAt?: string;
  /** 原始互动数据，用于排序与可信度判断 */
  engagement?: { likes?: number; comments?: number; collects?: number };
};

export type RideScore = {
  rideId: string;
  overallScore: number;
  waitScore: number;
  sentimentScore: number;
  profileMatchScore: number;
  reasoning: string;
  recommended: boolean;
  priority: "must-do" | "worth-it" | "skip" | "if-time";
};

export type ItineraryItem = {
  time: string;
  endTime: string;
  itemId: string;
  itemName: string;
  area: string;
  estimatedWait: number;
  walkMinutes: number;
  duration: number;
  note: string;
  type: "ride" | "meal" | "photo" | "shop" | "show" | "rest" | "parade" | "fireworks" | "walk";
  isAnchor?: boolean;
  isSoftAnchor?: boolean;
  llType?: "package" | "single" | null;
  singleRiderTip?: boolean;
  requiresReservation?: boolean;
  photoTips?: string;
  shopTips?: string;
  hasReservedSpot?: boolean;   // 臻享/礼宾预留位
};

export type RouteWeights = {
  waitWeight: number;
  walkWeight: number;
  energyWeight: number;
};

export type ParkHours = {
  open: string;
  close: string;
  source: "live" | "estimated";
};

export type Park = {
  id: string;
  name: string;
  city: string;
  timezone: string;
  theparksApiId: string;
  queueTimesId?: number;
  defaultParadeTime: string;
  defaultFireworksTime: string;
  areas: ParkArea[];
};
