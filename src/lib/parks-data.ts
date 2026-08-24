import { Park, Ride, PhotoSpot, ShopSpot, Restaurant } from "@/types";
import { LL_ELIGIBLE_RIDES } from "./ll-packages";
import { SHANGHAI_SHOPS } from "./shops-data";

// ─── 步行时间矩阵（上海迪士尼，分钟，成人正常步速 80m/min）──────────────
// 数据基于园区实际路线距离估算，行动不便×2.0，带幼童×1.6，带小学生×1.3
//
// 由 scripts/check_walk_matrix.mjs 对照 themeparks.wiki 的真实坐标做几何校验，
// CI 每次运行。校验只能证伪不能证实：低于「直线距离÷步速」的条目是硬错误
// （走得比直线还快），偏高则可能是绕湖等真实原因，需实地核对。
//
// 待实地核对（几何上偏高，但园区中央有湖，绕行可能是真的）：
//   treasure→zootopia  直线 206m，估 15 分钟（期望约 4.7）
//   fantasy→zootopia   直线 215m，估 11 分钟（期望约 4.8）
export const WALK_MATRIX: Record<string, Record<string, number>> = {
  entrance:  { entrance:0, mickey:2,  garden:5,  fantasy:8,  adventure:12, treasure:14, tomorrow:10, toytown:13, zootopia:16 },
  mickey:    { entrance:2, mickey:0,  garden:4,  fantasy:6,  adventure:10, treasure:12, tomorrow:8,  toytown:11, zootopia:14 },
  garden:    { entrance:5, mickey:4,  garden:0,  fantasy:4,  adventure:8,  treasure:10, tomorrow:6,  toytown:9,  zootopia:12 },
  fantasy:   { entrance:8, mickey:6,  garden:4,  fantasy:0,  adventure:7,  treasure:8,  tomorrow:6,  toytown:8,  zootopia:11 },
  adventure: { entrance:12,mickey:10, garden:8,  fantasy:7,  adventure:0,  treasure:5,  tomorrow:9,  toytown:11, zootopia:13 },
  treasure:  { entrance:14,mickey:12, garden:10, fantasy:8,  adventure:5,  treasure:0,  tomorrow:11, toytown:13, zootopia:15 },
  tomorrow:  { entrance:10,mickey:8,  garden:6,  fantasy:6,  adventure:9,  treasure:11, tomorrow:0,  toytown:5,  zootopia:7  },
  toytown:   { entrance:13,mickey:11, garden:9,  fantasy:8,  adventure:11, treasure:13, tomorrow:5,  toytown:0,  zootopia:7  },
  zootopia:  { entrance:16,mickey:14, garden:12, fantasy:11, adventure:13, treasure:15, tomorrow:7,  toytown:7,  zootopia:0  },
};

export function walkTime(
  from: string, to: string,
  profile: { mobilityNeeds: boolean; kids?: {age:number;heightCm:number}[] }
): number {
  const base = WALK_MATRIX[from]?.[to] ?? WALK_MATRIX[to]?.[from] ?? 8;
  const ages = (profile.kids??[]).map(k=>k.age);
  if (profile.mobilityNeeds) return Math.round(base * 2.0);
  if (ages.some((a) => a <= 3)) return Math.round(base * 1.8);
  if (ages.some((a) => a <= 6)) return Math.round(base * 1.5);
  if (ages.length > 0) return Math.round(base * 1.3);
  return base;
}

// ─── 营业时间估算（非当日）────────────────────────────────────────────────────
export function estimateParkHours(dateStr: string): { open: string; close: string; source: "estimated" } {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const dow   = date.getDay();
  const mmdd  = `${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

  // 黄金周/春节（最长营业）
  const goldenWeek = ["10-01","10-02","10-03","10-04","10-05","10-06","10-07",
                      "01-01","02-09","02-10","02-11","02-12","02-13","02-14","02-15","02-16"];
  if (goldenWeek.includes(mmdd)) return { open:"08:00", close:"22:30", source:"estimated" };

  // 暑假 7-8 月
  if (month === 7 || month === 8) return { open:"08:00", close:"22:00", source:"estimated" };

  // 其他法定节假日
  const holidays = ["04-04","04-05","05-01","05-02","05-03","06-01","09-29","09-30"];
  if (holidays.includes(mmdd)) return { open:"08:00", close:"22:00", source:"estimated" };

  // 周末
  if (dow === 0 || dow === 6) return { open:"08:30", close:"21:30", source:"estimated" };

  // 平日
  return { open:"09:00", close:"21:00", source:"estimated" };
}

// ─── 评论关键词（多关键词并发搜索，数据来自真实用户习惯）──────────────────
export const RIDE_KEYWORDS: Record<string, string[]> = {
  "zootopia-ride":    ["疯狂动物城热力追踪","上海迪士尼热力追踪","动物城项目攻略","迪士尼热力追踪排队","热力追踪值得玩吗"],
  "tron":             ["创极速光轮","上海迪士尼TRON","迪士尼摩托车过山车","创极速攻略","光轮排队多久"],
  "soaring":          ["翱翔飞越地平线","上海迪士尼飞越","飞越地平线攻略","飞越地平线值得吗","飞越地平线5D"],
  "dragon":           ["抱抱龙冲天赛车","迪士尼抱抱龙","上海迪士尼新过山车","抱抱龙排队","抱抱龙刺激吗"],
  "seven-dwarfs":     ["七个小矮人矿山车","迪士尼矿山车","白雪公主矿山车","七矮人攻略","迪士尼亲子过山车"],
  "roaring-rapids":   ["雷鸣山漂流","迪士尼漂流","探险岛漂流","雷鸣山会湿吗","迪士尼水上项目"],
  "pirates":          ["加勒比海盗上海迪士尼","迪士尼海盗船","宝藏湾加勒比","加勒比海盗真人特技","迪士尼加勒比攻略"],
  "soaring-adv":      ["翱翔飞越地平线2","飞越地平线扩建","飞越地平线新版","迪士尼飞越地平线2025"],
  "frozen":           ["冰雪奇缘迪士尼","上海迪士尼冰雪奇缘","冰雪奇缘项目","艾莎迪士尼","迪士尼冰雪"],
  "winnie":           ["小熊维尼历险记","上海迪士尼维尼","维尼历险记攻略","迪士尼小熊维尼","维尼排队"],
  "peter-pan":        ["小飞侠天空奇遇","迪士尼小飞侠","梦幻世界小飞侠","彼得潘迪士尼"],
  "buzz-lightyear":   ["巴斯光年星际营救","迪士尼巴斯光年","迪士尼射击游戏","巴斯光年攻略"],
  "slinky-dash":      ["胡迪牛仔嘉年华","迪士尼胡迪","玩具总动员过山车","弹簧狗迪士尼"],
  "alien-pizza":      ["弹簧狗团团转","迪士尼弹簧狗","玩具总动员旋转","迪士尼三眼仔"],
  "stunt-show":       ["超凡战警特技","迪士尼特技表演","迪士尼好莱坞特技","上海迪士尼表演秀","特技表演几点"],
  "crystal-grotto":   ["晶彩奇航","迪士尼晶彩奇航","上海迪士尼游船","晶彩奇航夜景","迪士尼奇航"],
  "alice-maze":       ["爱丽丝梦游仙境迷宫","迪士尼爱丽丝迷宫","上海迪士尼迷宫","爱丽丝迷宫拍照"],
  "exploration-trail":["古迹探索营","迪士尼绳索探险","上海迪士尼探险岛绳索","古迹探索攻略"],
  "canoe":            ["探险家独木舟","迪士尼独木舟","上海迪士尼划船"],
  "jet-packs":        ["喷气背包飞行器","迪士尼喷气背包","明日世界喷气背包","上海迪士尼旋转飞行"],
  "fantasy-tale":     ["漫游童话时光","迪士尼城堡内部","城堡漫游","上海迪士尼城堡参观"],
  "stormy-jack":      ["风暴来临迪士尼","杰克船长特技","宝藏湾表演","迪士尼海盗表演"],
  "mickey-show":      ["米奇童话专列","迪士尼花车","巡游路线","米奇专列几点"],
};

export const RESTAURANT_KEYWORDS: Record<string, string[]> = {
  "royal-banquet":    ["皇家宴会厅","迪士尼城堡餐厅","上海迪士尼皇家宴会","皇家宴会厅预约","皇家宴会厅值得吗"],
  "lumiere":          ["卢米亚厨房","迪士尼卢米亚","上海迪士尼贝儿餐厅","卢米亚预约","卢米亚好吃吗"],
  "barbossa":         ["巴波萨烧烤","迪士尼烧烤","上海迪士尼烤猪肋排","巴波萨好吃","宝藏湾烧烤"],
  "tribe-feast":      ["部落丰盛堂","迪士尼探险岛餐厅","上海迪士尼部落","部落丰盛堂推荐","迪士尼宫保鸡丁"],
  "old-vine":         ["老藤树食栈","上海迪士尼老藤树","迪士尼美式餐厅","老藤树好吃吗"],
  "star-terrace":     ["星露台餐厅","迪士尼星露台","上海迪士尼明日世界餐厅","复仇者联盟汉堡","星露台推荐"],
  "pinocchio":        ["皮诺丘乡村厨房","迪士尼皮诺丘","上海迪士尼梦幻世界餐厅","皮诺丘厨房攻略"],
  "toy-box-feast":    ["玩具盒欢宴广场","迪士尼玩具总动员餐厅","上海迪士尼玩具餐厅"],
  "man-yue":          ["漫月食府","迪士尼漫月","上海迪士尼中式正餐","漫月食府预约","漫月食府好吃吗"],
  "lucky-star":       ["米奇好伙伴美味集市","迪士尼米奇大街美食","上海迪士尼快餐","迪士尼集市"],
  "tutunga":          ["土图嘉风味小馆","迪士尼火鸡腿","上海迪士尼火鸡腿","宝藏湾小吃","土图嘉火鸡腿"],
};

// ─── 上海迪士尼（唯一支持园区）──────────────────────────────────────────────
export const PARKS: Park[] = [
  {
    id: "shanghai",
    name: "上海迪士尼乐园",
    city: "上海，中国",
    timezone: "Asia/Shanghai",
    theparksApiId: "ddc4357c-c148-4b36-9888-07894fe75e83",
    queueTimesId: 30,
    defaultParadeTime: "15:45",
    defaultFireworksTime: "21:00",
    areas: [
      { id:"entrance",  name:"园区入口",               emoji:"🚪" },
      { id:"mickey",    name:"米奇大街",               emoji:"🎪" },
      { id:"garden",    name:"奇想花园",               emoji:"🌸" },
      { id:"fantasy",   name:"梦幻世界",               emoji:"🏰" },
      { id:"adventure", name:"探险岛",                 emoji:"🌿" },
      { id:"treasure",  name:"宝藏湾",                 emoji:"⚓" },
      { id:"tomorrow",  name:"明日世界",               emoji:"🚀" },
      { id:"toytown",   name:"迪士尼·皮克斯玩具总动员", emoji:"🧸" },
      { id:"zootopia",  name:"疯狂动物城",             emoji:"🦊" },
    ],
  },
];

// ─── 完整项目列表（数据来源：上海迪士尼官网尊享卡页面 + 攻略验证）─────────
// 身高限制来源：https://www.shanghaidisneyresort.com/annual-pass/diamond-annual-pass/
const RAW_RIDES: Ride[] = [
  // ── 疯狂动物城（最新园区，2023年开放）──────────────────────────────────────
  {
    id:"zootopia-ride", name:"疯狂动物城：热力追踪",
    parkId:"shanghai", area:"zootopia", areaName:"疯狂动物城",
    type:"dark", heightRequirement:null, thrillScore:3, kidsScore:5,
    waitTime:null, rideDuration:8, llEligible:true, singleRider:false,
    tags:["new","family","indoor","no-height","must-do","immersive","zootopia"],
    description:"全球独家新园区旗舰项目。与朱迪和尼克一起追踪犯人，沉浸式破案体验。无身高限制全家都能坐。2023年开放后持续高人气，强烈建议顶门冲或买尊享卡。",
  },

  // ── 明日世界 ────────────────────────────────────────────────────────────────
  {
    id:"tron", name:"创极速光轮 TRON Lightcycle Run",
    parkId:"shanghai", area:"tomorrow", areaName:"明日世界",
    type:"coaster", heightRequirement:122, thrillScore:5, kidsScore:1,
    waitTime:null, rideDuration:5, llEligible:true, singleRider:true,
    tags:["thrill","indoor","fast","iconic","must-do","flagship"],
    description:"上海迪士尼最标志性项目，全球最刺激过山车之一。俯卧骑行光轮摩托以时速100km穿越霓虹数字世界，5分钟体验拉满。全园等待时间最长，开园后立刻顶门冲或购买单项尊享卡。122cm身高要求。",
  },
  {
    id:"buzz-lightyear", name:"巴斯光年星际营救",
    parkId:"shanghai", area:"tomorrow", areaName:"明日世界",
    type:"dark", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:6, llEligible:true, singleRider:false,
    tags:["interactive","shooter","kids","no-height","replayable","family"],
    description:"互动射击游戏，发光枪打机器人比分。无身高限制，小朋友和大人都会玩得投入，可以反复多刷挑战高分。相比其他热门项目排队时间较短。",
  },
  {
    id:"jet-packs", name:"喷气背包飞行器",
    parkId:"shanghai", area:"tomorrow", areaName:"明日世界",
    type:"spinner", heightRequirement:112, thrillScore:3, kidsScore:3,
    waitTime:null, rideDuration:3, llEligible:false, singleRider:false,
    tags:["spinner","outdoor","views","thrill"],
    description:"可升降旋转飞行器，背着喷气背包飞上半空俯瞰明日世界全景。112cm身高要求，旋转时有一定离心力。等待时间通常较短，适合下午时段插空玩。",
  },

  // ── 梦幻世界 ────────────────────────────────────────────────────────────────
  {
    id:"seven-dwarfs", name:"七个小矮人矿山车",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"coaster", heightRequirement:97, thrillScore:2, kidsScore:5,
    waitTime:null, rideDuration:4, llEligible:true, singleRider:false,
    tags:["kids","family","classic","indoor-outdoor","gentle-coaster"],
    description:"孩子第一辆过山车的最佳选择。矿车左右摇摆穿过钻石矿山，失重感极低。97cm身高要求，排队区有互动游戏。全家老小都能坐，亲子必玩。",
  },
  {
    id:"frozen", name:"冰雪奇缘：极境之旅",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"boat", heightRequirement:null, thrillScore:2, kidsScore:5,
    waitTime:null, rideDuration:10, llEligible:true, singleRider:false,
    tags:["family","indoor","boat","no-height","must-do","immersive","frozen"],
    description:"跟随艾莎和安娜的冰雪冒险，全球最大室内人工雪景。无身高限制，视觉震撼。冰雪奇缘粉丝必玩，等待时间通常较长。",
  },
  {
    id:"peter-pan", name:"小飞侠天空奇遇",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"dark", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:5, llEligible:false, singleRider:false,
    tags:["kids","classic","gentle","no-height","toddler-ok"],
    description:"乘海盗船飞越梦幻岛，零刺激纯魔幻氛围。无身高限制，适合最小的孩子。等待时间常被低估，建议错峰游玩。",
  },
  {
    id:"winnie", name:"小熊维尼历险记",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"dark", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:5, llEligible:true, singleRider:false,
    tags:["kids","gentle","no-height","toddler-ok","classic","family"],
    description:"跟随维尼熊穿越百亩森林，蜂蜜罐造型的旋转车厢超温馨。无身高限制，婴幼儿和老人都能坐。等待时间通常适中。",
  },
  {
    id:"carousel", name:"幻想曲旋转木马",
    parkId:"shanghai", area:"garden", areaName:"奇想花园",
    type:"spinner", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:3, llEligible:false, singleRider:false,
    tags:["kids","gentle","no-height","photo-worthy","classic","night"],
    description:"城堡前经典旋转木马，1.2m以下需家长陪同。烟花结束后亮起全园最浪漫灯光，是全天最佳拍照时机之一，根本不用修图。",
  },
  {
    id:"dumbo", name:"飞象旋转世界",
    parkId:"shanghai", area:"garden", areaName:"奇想花园",
    type:"spinner", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:3, llEligible:false, singleRider:false,
    tags:["kids","gentle","no-height","toddler-ok","classic"],
    description:"经典的小飞象旋转，可自控飞象升降高度。无身高限制，适合最小的孩子。等待时间短，适合填充空隙。",
  },
  {
    id:"fantasy-tale", name:"漫游童话时光",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"show", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:15, llEligible:false, singleRider:false,
    tags:["walk-through","no-height","castle-inside","photo-worthy","family"],
    description:"城堡内部参观步行游览，白雪公主故事通过声光电呈现。无需排队但全程步行，有几处绝佳拍照场景。不带孩子的成人会觉得略短。",
  },
  {
    id:"alice-maze", name:"爱丽丝梦游仙境迷宫",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"show", heightRequirement:null, thrillScore:1, kidsScore:4,
    waitTime:null, rideDuration:20, llEligible:false, singleRider:false,
    tags:["walk-through","no-height","photo-worthy","maze","interactive"],
    description:"户外迷宫步行体验，红皇后宝座和疯帽子茶会是热门拍照点。无身高限制，下午4-5点光线最佳。很少排队。",
  },
  {
    id:"crystal-grotto", name:"晶彩奇航",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"boat", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:15, llEligible:true, singleRider:false,
    tags:["family","boat","indoor","gentle","no-height","night","scenic"],
    description:"游船穿越迪士尼经典场景水晶洞穴，有灯光喷泉效果。夜间体验更佳，出口处护城河倒影可拍城堡烟花长曝光。无身高限制。",
  },

  // ── 探险岛 ──────────────────────────────────────────────────────────────────
  {
    id:"soaring", name:"翱翔·飞越地平线",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    type:"simulator", heightRequirement:102, thrillScore:2, kidsScore:4,
    waitTime:null, rideDuration:8, llEligible:true, singleRider:false,
    tags:["simulator","family","gentle","scenic","photogenic","must-do","5D"],
    description:"悬挂式座椅模拟飞翔全球美景+气味特效，5D球幕电影。不刺激但极震撼，全家老小必玩。102cm以上可坐。等待时间全园前三长，建议顶门或购买尊享卡。2025年扩建后容量增加50%。",
  },
  {
    id:"roaring-rapids", name:"雷鸣山漂流",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    type:"boat", heightRequirement:107, thrillScore:3, kidsScore:3,
    waitTime:null, rideDuration:8, llEligible:false, singleRider:false,
    tags:["water","family","outdoor","summer","thrill","wet"],
    description:"激流漂流必湿。夏天消暑必玩，入口处10元/件雨衣。非夏天建议备用衣物。107cm身高要求，漂流途中有随机喷水点。",
  },
  {
    id:"exploration-trail", name:"古迹探索营绳索挑战道",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    type:"show", heightRequirement:106, thrillScore:2, kidsScore:4,
    waitTime:null, rideDuration:30, llEligible:true, singleRider:false,
    tags:["outdoor","kids","physical","challenge","ropes"],
    description:"户外高空绳索探险挑战，穿越丛林树冠间的障碍。106cm身高要求，需穿封闭式运动鞋。消耗精力神器，孩子特别爱。需穿不露脚趾的鞋。",
  },
  {
    id:"canoe", name:"探险家独木舟",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    type:"boat", heightRequirement:null, thrillScore:1, kidsScore:4,
    waitTime:null, rideDuration:15, llEligible:false, singleRider:false,
    tags:["outdoor","family","paddle","no-height","interactive","teamwork"],
    description:"多人共同划桨的独木舟探险。无身高限制但需双脚着地。真正靠团队划桨前进，有趣互动体验。等待时间通常较短，适合填充行程间隙。",
  },

  // ── 宝藏湾 ──────────────────────────────────────────────────────────────────
  {
    id:"pirates", name:"加勒比海盗：沉落宝藏之战",
    parkId:"shanghai", area:"treasure", areaName:"宝藏湾",
    type:"boat", heightRequirement:null, thrillScore:2, kidsScore:5,
    waitTime:null, rideDuration:15, llEligible:true, singleRider:false,
    tags:["classic","family","indoor","no-height","photogenic","must-do","live-action"],
    description:"全球最大版加勒比海盗，有真人特技演员现场表演，5D水景+全息投影。无身高限制15分钟超值体验。宝藏湾整体是全园最美拍照区之一。",
  },
  {
    id:"stormy-jack", name:"风暴来临——杰克船长之惊天特技大冒险",
    parkId:"shanghai", area:"treasure", areaName:"宝藏湾",
    type:"show", heightRequirement:null, thrillScore:2, kidsScore:4,
    waitTime:null, rideDuration:20, llEligible:false, singleRider:false,
    tags:["show","outdoor","interactive","no-height","live-action","family"],
    description:"宝藏湾剧场的户外特技表演，前排观众有机会被选中参与互动。约20分钟，查好当天场次时间。无身高限制，全家适合。",
  },

  // ── 玩具总动员 ──────────────────────────────────────────────────────────────
  {
    id:"dragon", name:"抱抱龙冲天赛车",
    parkId:"shanghai", area:"toytown", areaName:"迪士尼·皮克斯玩具总动员",
    type:"coaster", heightRequirement:120, thrillScore:4, kidsScore:2,
    waitTime:null, rideDuration:4, llEligible:true, singleRider:false,
    tags:["thrill","outdoor","coaster","new","drop","intense"],
    description:"高刺激项目，垂直俯冲+强失重感+高速弯道。120cm身高要求。比跳楼机更刺激，刺激系仅次于TRON。2022年开放，是园区第二热门项目。",
  },
  {
    id:"slinky-dash", name:"胡迪牛仔嘉年华",
    parkId:"shanghai", area:"toytown", areaName:"迪士尼·皮克斯玩具总动员",
    type:"coaster", heightRequirement:81, thrillScore:2, kidsScore:5,
    waitTime:null, rideDuration:4, llEligible:true, singleRider:false,
    tags:["kids","family","outdoor","coaster","gentle","colorful"],
    description:"弹簧狗造型的家庭过山车，户外运行能看到整个玩具总动员园区。81cm即可坐，是园区内身高限制最低的过山车，极适合家庭。",
  },
  {
    id:"alien-pizza", name:"弹簧狗团团转",
    parkId:"shanghai", area:"toytown", areaName:"迪士尼·皮克斯玩具总动员",
    type:"spinner", heightRequirement:null, thrillScore:2, kidsScore:4,
    waitTime:null, rideDuration:3, llEligible:false, singleRider:false,
    tags:["spinner","outdoor","kids","family","no-height","dizzy"],
    description:"坐在弹簧狗车厢内旋转，注意离心力较强，容易晕的人慎坐。无身高限制。等待时间通常不长。",
  },

  // ── 演出/秀 ──────────────────────────────────────────────────────────────────
  {
    id:"stunt-show", name:"超凡战警：特技表演秀",
    parkId:"shanghai", area:"mickey", areaName:"米奇大街",
    type:"show", heightRequirement:null, thrillScore:2, kidsScore:4,
    waitTime:null, rideDuration:25, llEligible:false, singleRider:false,
    tags:["show","family","action","no-height","scheduled","cars","explosion"],
    description:"真实特技表演，汽车追逐+爆炸+摩托飞跃，约25分钟。需提前15分钟入座，查好当天场次时间（通常每天1-2场）。无身高限制，全家适合。",
  },
  {
    id:"mickey-show", name:"米奇童话专列（日间巡游）",
    parkId:"shanghai", area:"mickey", areaName:"米奇大街",
    type:"show", heightRequirement:null, thrillScore:1, kidsScore:5,
    waitTime:null, rideDuration:30, llEligible:false, singleRider:false,
    tags:["parade","family","outdoor","no-height","character","scheduled"],
    description:"米奇和朋友们的日间花车巡游，起点玩具总动员区域附近，终点爱丽丝迷宫附近。通常每天1-2场，具体时间查官方App。提前20-30分钟占位，玩具总动员区角色互动最多。",
  },
];

// ─── 拍照打卡点（15个，含具体位置和步行信息）────────────────────────────────
/**
 * 尊享卡资格由 LL_ELIGIBLE_RIDES 单一决定。
 *
 * 此前 Ride.llEligible 与 LL_ELIGIBLE_RIDES 是两份手工维护的清单，实际已经分叉：
 * roaring-rapids / peter-pan / dumbo 在官方清单里却被标为不可购卡（导致 UI 说
 * 不能买、路径规划却照样给 85% 折扣），frozen 反之。以官方清单为准派生该字段，
 * 两者不再可能不一致。
 *
 * 注：frozen（冰雪奇缘·极境之旅）因此变为不可购卡——官网尊享卡页面未列出该项目，
 * 若后续官方将其纳入，改 LL_ELIGIBLE_RIDES 一处即可。
 */
export const RIDES: Ride[] = RAW_RIDES.map((ride) => ({
  ...ride,
  llEligible: LL_ELIGIBLE_RIDES.includes(ride.id),
}));

export const PHOTO_SPOTS: PhotoSpot[] = [
  {
    id:"castle-front", name:"奇幻童话城堡正面",
    parkId:"shanghai", area:"garden", areaName:"奇想花园",
    nearestRide:"carousel", walkFromNearestRide:1,
    bestTimeSlots:["09:00-09:30","17:00-18:30","烟花后21:00-21:20"],
    bestConditions:"开园人少+黄昏暖光+烟花期间城堡灯光秀",
    tags:["城堡","地标","必拍","夜景","烟花"],
    tips:"正对城堡中轴线约50米处最佳构图。烟花时城堡投影+焰火同框是全天最佳时机，提前30分钟在城堡前方奇想花园正中央占位。",
    xhsKeyword:"上海迪士尼城堡拍照机位",
    duration:15, photoType:"landmark",
  },
  {
    id:"castle-grotto-reflection", name:"晶彩奇航出口护城河倒影",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    nearestRide:"crystal-grotto", walkFromNearestRide:1,
    bestTimeSlots:["烟花期间20:30-21:15"],
    bestConditions:"烟花时护城河水面倒影城堡+烟花，长曝光效果惊艳",
    tags:["倒影","城堡","夜景","烟花","护城河","长曝光"],
    tips:"晶彩奇航出口处护城河边是拍烟花+城堡倒影的小众机位。用手机专业模式长曝光，水面倒影让画面层次翻倍。",
    xhsKeyword:"上海迪士尼护城河倒影烟花",
    duration:10, photoType:"scenic",
  },
  {
    id:"carousel-night", name:"旋转木马烟花后夜景",
    parkId:"shanghai", area:"garden", areaName:"奇想花园",
    nearestRide:"carousel", walkFromNearestRide:0,
    bestTimeSlots:["烟花后21:10-22:00"],
    bestConditions:"烟花结束后木马亮起全园最浪漫灯光，无需修图",
    tags:["夜景","旋转木马","烟花后","直出","浪漫","情侣"],
    tips:"烟花散场立刻走过来，旋转木马灯光全亮，是全园最浪漫夜景。很多攻略提到这个时段根本不用修图，但灯光持续时间有限，要抓紧。",
    xhsKeyword:"上海迪士尼旋转木马夜景烟花后",
    duration:10, photoType:"scenic",
  },
  {
    id:"tron-night", name:"TRON入口霓虹光圈",
    parkId:"shanghai", area:"tomorrow", areaName:"明日世界",
    nearestRide:"tron", walkFromNearestRide:1,
    bestTimeSlots:["19:30-22:00"],
    bestConditions:"夜间蓝紫色霓虹灯全亮，科幻感拉满",
    tags:["科幻","夜景","霓虹","TRON","网红","ins"],
    tips:"TRON入口蓝色光圈是ins超热门机位。夜间手机专业模式长曝光拍出光轨效果。白天也能拍但效果差很多，建议晚上入园必来。",
    xhsKeyword:"上海迪士尼TRON霓虹拍照夜景",
    duration:10, photoType:"themed",
  },
  {
    id:"tomorrow-night", name:"明日世界广场夜景",
    parkId:"shanghai", area:"tomorrow", areaName:"明日世界",
    nearestRide:"buzz-lightyear", walkFromNearestRide:3,
    bestTimeSlots:["19:00-22:00"],
    bestConditions:"夜间蓝紫色地面灯光铺满广场，科幻感极强",
    tags:["夜景","科幻","蓝紫","广场","未来感"],
    tips:"明日世界整个广场夜间蓝紫色灯光铺满地面，从广场中央往TRON方向拍科幻大片感十足。手机夜景模式或专业模式ISO调低。",
    xhsKeyword:"上海迪士尼明日世界夜景广场",
    duration:10, photoType:"scenic",
  },
  {
    id:"mickey-street-sym", name:"米奇大街对称轴构图",
    parkId:"shanghai", area:"mickey", areaName:"米奇大街",
    nearestRide:"stunt-show", walkFromNearestRide:3,
    bestTimeSlots:["09:00-09:30","17:30-19:00"],
    bestConditions:"开园人最少+傍晚街灯暖光",
    tags:["对称","街道","必拍","城堡","经典构图"],
    tips:"站在米奇大街入口处，以城堡为终点拍对称构图，是全园最经典机位之一。开园后5分钟人最少。傍晚街灯亮起后也超好看，两侧建筑灯光温暖。",
    xhsKeyword:"上海迪士尼米奇大街对称构图",
    duration:10, photoType:"scenic",
  },
  {
    id:"treasure-port", name:"宝藏湾港口木栈道",
    parkId:"shanghai", area:"treasure", areaName:"宝藏湾",
    nearestRide:"pirates", walkFromNearestRide:2,
    bestTimeSlots:["10:00-16:00","17:00-18:30"],
    bestConditions:"傍晚水面金光，海盗帆船倒影",
    tags:["海盗","水景","打卡","宝藏湾","帆船","倒影"],
    tips:"木栈道可拍海盗大帆船+城堡双入画。傍晚水面金光是小红书最爆款机位。带广角镜头或超广角手机更出片。",
    xhsKeyword:"上海迪士尼宝藏湾港口拍照",
    duration:15, photoType:"scenic",
  },
  {
    id:"pirate-ship", name:"宝藏湾海盗大帆船",
    parkId:"shanghai", area:"treasure", areaName:"宝藏湾",
    nearestRide:"stormy-jack", walkFromNearestRide:2,
    bestTimeSlots:["10:00-14:00","17:00-19:00"],
    bestConditions:"傍晚夕阳打在船帆上最壮观",
    tags:["帆船","海盗","壮观","地标"],
    tips:"傍晚夕阳时分船帆被染成金色，站在对岸木栈道拍效果最佳。白天光线充足，侧光最能体现帆船的立体感。",
    xhsKeyword:"上海迪士尼海盗帆船拍照",
    duration:10, photoType:"landmark",
  },
  {
    id:"zootopia-street", name:"疯狂动物城主街道",
    parkId:"shanghai", area:"zootopia", areaName:"疯狂动物城",
    nearestRide:"zootopia-ride", walkFromNearestRide:2,
    bestTimeSlots:["09:00-10:30","16:00-18:00"],
    bestConditions:"开园人少，下午光线侧打主题建筑最有层次",
    tags:["疯狂动物城","新园区","街道","主题","朱迪","尼克"],
    tips:"动物城街道还原度极高，邮局、派出所前都是热门机位。朱迪和尼克的角色在这里出现概率最高，约下午2-3点有见面会。",
    xhsKeyword:"上海迪士尼疯狂动物城拍照打卡",
    duration:20, photoType:"themed",
  },
  {
    id:"frozen-ice", name:"冰雪奇缘雪景区",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    nearestRide:"frozen", walkFromNearestRide:1,
    bestTimeSlots:["09:00-11:00","15:00-17:00"],
    bestConditions:"室内全天可拍，早上人少等待短",
    tags:["冰雪奇缘","艾莎","雪景","室内","热门"],
    tips:"冰雪奇缘园区入口艾莎冰雪造型是超热门打卡点，室内不受天气影响。人多需排队拍照要有耐心，建议下午3点后人稍少。",
    xhsKeyword:"上海迪士尼冰雪奇缘打卡艾莎",
    duration:15, photoType:"themed",
  },
  {
    id:"alice-maze-photo", name:"爱丽丝迷宫红皇后宝座",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    nearestRide:"alice-maze", walkFromNearestRide:0,
    bestTimeSlots:["10:00-12:00","16:00-18:00"],
    bestConditions:"下午4-5点光线从侧面射入，复古感最强",
    tags:["爱丽丝","红皇后","复古","童话","迷宫"],
    tips:"红皇后宝座是迷宫内最热门拍照点，复古宫廷感拉满。下午4-5点光线从侧面射入，效果最好。疯帽子茶会场景也值得拍。",
    xhsKeyword:"上海迪士尼爱丽丝迷宫红皇后拍照",
    duration:15, photoType:"themed",
  },
  {
    id:"parade-route", name:"花车巡游沿线",
    parkId:"shanghai", area:"mickey", areaName:"米奇大街",
    nearestRide:"stunt-show", walkFromNearestRide:2,
    bestTimeSlots:["花车开始前20分钟占位"],
    bestConditions:"花车经过瞬间，角色互动时抢拍",
    tags:["花车","巡游","角色","互动","动态","米奇"],
    tips:"推荐站在玩具总动员区域，角色互动概率最高。提前20分钟占位，蹲下从低角度仰拍花车效果好。注意关闭闪光灯。起点在玩具总动员附近，终点在爱丽丝迷宫附近。",
    xhsKeyword:"上海迪士尼花车巡游拍照技巧位置",
    duration:35, photoType:"interactive",
  },
  {
    id:"adventure-waterfall", name:"探险岛瀑布区",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    nearestRide:"roaring-rapids", walkFromNearestRide:3,
    bestTimeSlots:["10:00-15:00"],
    bestConditions:"晴天阳光照射水雾出彩虹",
    tags:["瀑布","探险","自然","彩虹","丛林"],
    tips:"漂流附近的人工瀑布区，晴天阳光照射水雾会出现小彩虹。穿绿色系衣服在这里拍丛林探险风格很出片，人少是大优势。",
    xhsKeyword:"上海迪士尼探险岛瀑布彩虹",
    duration:10, photoType:"scenic",
  },
  {
    id:"character-meet", name:"角色见面会（米奇之家）",
    parkId:"shanghai", area:"mickey", areaName:"米奇大街",
    nearestRide:"stunt-show", walkFromNearestRide:4,
    bestTimeSlots:["09:30-11:00","14:00-16:00"],
    bestConditions:"开园后1小时等待最短（通常20-40分钟）",
    tags:["角色","米奇","见面会","互动","签名"],
    tips:"米奇大街米奇之家是固定见面会地点，开园后1小时等待最短。下午场角色可能更换，查官方App当天日程。带孩子来必打卡。",
    xhsKeyword:"上海迪士尼米奇见面会攻略排队",
    duration:45, photoType:"interactive",
  },
  {
    id:"toytown-overview", name:"玩具总动员园区全景",
    parkId:"shanghai", area:"toytown", areaName:"迪士尼·皮克斯玩具总动员",
    nearestRide:"slinky-dash", walkFromNearestRide:2,
    bestTimeSlots:["09:00-11:00","15:00-17:00"],
    bestConditions:"上午光线好，胡迪过山车运行时可抓拍",
    tags:["玩具总动员","全景","胡迪","色彩","鲜艳"],
    tips:"园区内有处高台可俯拍整个玩具总动员，胡迪牛仔嘉年华过山车经过时抢拍动态。超级鲜艳的色彩，直出就好看，适合发朋友圈。",
    xhsKeyword:"上海迪士尼玩具总动员全景拍照",
    duration:10, photoType:"themed",
  },
];

// ─── 购物点（完整）──────────────────────────────────────────────────────────
// 商店数据来自官网，由 scripts/generate_shops.mjs 生成，见 src/lib/shops-data.ts。
// 此前这里是手写的 7 家，其中若干店名在官方清单中并不存在。
export const SHOP_SPOTS: ShopSpot[] = SHANGHAI_SHOPS;

export const RESTAURANTS: Restaurant[] = [
  // ── 高端预约餐厅 ────────────────────────────────────────────────────────────
  {
    id:"royal-banquet", name:"皇家宴会厅",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界（城堡内）",
    type:"fancy", requiresReservation:true,
    reservationTips:"全园最高端餐厅，需提前在官方App预约。套餐368元/人，含前菜+主菜+甜点+饮料。可加购200元获得烟花VIP观看位。就餐前后可与迪士尼朋友各合影一次。",
    cuisine:"融合中西餐", priceRange:"¥¥¥", duration:75,
    bestMealTime:["lunch","dinner"], suitableModes:["family","photo","casual"],
    rating:4.6, photoWorthy:true,
    tags:["城堡内","最高端","角色互动","需预约","烟花VIP位","仪式感"],
    tips:"全园唯一在城堡内用餐体验，仪式感拉满。特色菜：川味海鲜龙虾两面黄、蟹饼配芒果沙沙。加购烟花VIP位是最值钱的隐藏玩法。",
    reviews:[
      { author:"仪式感MAX", source:"xiaohongshu", rating:5,
        text:"在城堡里吃饭这件事本身就值回票价！环境超级美，米奇和公主们轮流来合影。加购了烟花VIP位，那个角度看烟花是真的绝！368一人贵但绝对值得当作特别纪念。",
        tags:["城堡","角色互动","烟花VIP","仪式感"] },
      { author:"迪士尼深度玩", source:"tripadvisor", rating:4,
        text:"Best dining experience in the park. The castle interior is stunning. Characters visit during meal. Worth the price for the experience, not just the food quality.",
        tags:["castle","character","reservation","special"] },
    ],
  },
  {
    id:"lumiere", name:"卢米亚厨房",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"fancy", requiresReservation:true,
    reservationTips:"《美女与野兽》主题餐厅，需提前在官方App预约，建议提前1-2周。有角色互动（贝儿/野兽出现概率较高）。",
    cuisine:"法式欧式", priceRange:"¥¥¥", duration:60,
    bestMealTime:["lunch","dinner"], suitableModes:["family","photo"],
    rating:4.5, photoWorthy:true,
    tags:["美女与野兽","主题","需预约","角色互动","适合带娃","拍照圣地"],
    tips:"《美女与野兽》高度还原主题装修，贝儿和野兽有概率出现互动。穿公主裙来拍照效果绝佳。",
    reviews:[
      { author:"迪士尼妈妈日记", source:"xiaohongshu", rating:5,
        text:"卢米亚厨房真的太美了！装修超级梦幻还原了美女与野兽，女儿看到贝儿直接感动哭了。食物味道中规中矩但整体体验满分，必须提前两周预约！",
        tags:["角色互动","环境好","需提前预约"] },
    ],
  },

  // ── 主题正餐（无需预约）────────────────────────────────────────────────────
  {
    id:"barbossa", name:"巴波萨烧烤",
    parkId:"shanghai", area:"treasure", areaName:"宝藏湾",
    type:"normal", requiresReservation:false,
    cuisine:"烧烤/美式", priceRange:"¥¥", duration:40,
    bestMealTime:["lunch","dinner","snack"], suitableModes:["casual","thrill","shopping","photo"],
    rating:4.3, photoWorthy:true,
    tags:["烧烤","烤猪肋排","宝藏湾","户外","性价比","网红","火鸡腿"],
    tips:"园区内性价比最高的正餐。烤猪肋排套餐118元含饮料，是小红书排名第一的迪士尼美食。户外座位可边吃边看帆船。",
    reviews:[
      { author:"迪士尼美食必吃", source:"xiaohongshu", rating:5,
        text:"巴波萨烤猪肋排真的是迪士尼里性价比最高的一餐！肉量很足，酱汁酸甜，118元含饮料。坐在户外看着海盗船吃饭，太有氛围了！必吃！",
        tags:["好吃","性价比","烧烤","户外"] },
      { author:"吃货游迪士尼", source:"weibo", rating:4,
        text:"宝藏湾的烤肋排套餐真不错！比我预期好吃很多，迪士尼里难得的性价比，户外座位景色也好，强烈推荐",
        tags:["好吃","性价比","推荐"] },
    ],
  },
  {
    id:"tribe-feast", name:"部落丰盛堂",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    type:"normal", requiresReservation:false,
    cuisine:"融合中式/宫保鸡丁", priceRange:"¥¥", duration:40,
    bestMealTime:["lunch","dinner"], suitableModes:["family","casual"],
    rating:3.9, photoWorthy:false,
    tags:["探险岛","中式","宫保鸡丁","烤肉","亚柏栎主题"],
    tips:"探险岛主题餐厅，有现场烧烤区。宫保鸡丁是招牌，餐具都是亚柏栎主题树叶形托盘。容量大，等位时间相对短。",
    reviews:[
      { author:"探险岛美食", source:"xiaohongshu", rating:4,
        text:"部落丰盛堂探险主题很到位！宫保鸡丁味道不错，份量挺足的。可以一边看现场烧烤一边吃，氛围感很强。不需要预约直接去就好。",
        tags:["探险主题","宫保鸡丁","现场烧烤"] },
    ],
  },
  {
    id:"old-vine", name:"老藤树食栈",
    parkId:"shanghai", area:"adventure", areaName:"探险岛",
    type:"normal", requiresReservation:false,
    cuisine:"美式/三明治/沙拉", priceRange:"¥¥", duration:35,
    bestMealTime:["lunch","snack"], suitableModes:["casual","thrill"],
    rating:3.7, photoWorthy:false,
    tags:["探险岛","美式","快速","三明治","沙拉"],
    tips:"探险岛的轻食选择，三明治和沙拉为主。比正餐快，适合不想花太多时间吃饭的游客。",
    reviews:[
      { author:"迪士尼快攻", source:"xiaohongshu", rating:3,
        text:"老藤树食栈胜在快，探险岛位置也方便。食物普通但等待时间短，想省时间就来这里。",
        tags:["快速","普通","省时"] },
    ],
  },
  {
    id:"star-terrace", name:"星露台餐厅",
    parkId:"shanghai", area:"tomorrow", areaName:"明日世界",
    type:"normal", requiresReservation:false,
    cuisine:"美式/复仇者联盟主题", priceRange:"¥¥", duration:40,
    bestMealTime:["lunch","dinner"], suitableModes:["thrill","casual","photo"],
    rating:4.0, photoWorthy:true,
    tags:["明日世界","漫威","复仇者联盟汉堡","室外露台","夜景"],
    tips:"复仇者联盟主题汉堡98元，漫威迷必打卡。室外露台可欣赏夜景。不需要预约。",
    reviews:[
      { author:"漫威迷迪士尼", source:"xiaohongshu", rating:4,
        text:"星露台的复仇者联盟汉堡超好拍！88元不算贵，露台夜景很好，明日世界的灯光效果配上漫威主题，氛围感很强。漫威粉必来！",
        tags:["漫威","好拍","夜景","氛围"] },
    ],
  },
  {
    id:"pinocchio", name:"皮诺丘乡村厨房",
    parkId:"shanghai", area:"fantasy", areaName:"梦幻世界",
    type:"normal", requiresReservation:false,
    cuisine:"意式/欧式", priceRange:"¥¥", duration:40,
    bestMealTime:["lunch","dinner"], suitableModes:["family","casual","photo"],
    rating:3.8, photoWorthy:true,
    tags:["梦幻世界","皮诺丘","意式","欧式装修","可爱"],
    tips:"皮诺丘主题欧式装修，整体环境可爱。不需要预约，梦幻世界区域内用餐较方便。",
    reviews:[
      { author:"梦幻世界美食", source:"xiaohongshu", rating:4,
        text:"皮诺丘乡村厨房装修超可爱！意式装修风格，食物中规中矩，但环境加分不少，梦幻世界逛累了在这里歇脚吃饭很合适。",
        tags:["装修好","可爱","梦幻世界"] },
    ],
  },
  {
    id:"toy-box-feast", name:"玩具盒欢宴广场",
    parkId:"shanghai", area:"toytown", areaName:"迪士尼·皮克斯玩具总动员",
    type:"normal", requiresReservation:false,
    cuisine:"美式快餐/儿童套餐", priceRange:"¥¥", duration:30,
    bestMealTime:["lunch","snack"], suitableModes:["family","casual"],
    rating:3.8, photoWorthy:true,
    tags:["玩具总动员","儿童友好","亲子","快速","胡迪主题"],
    tips:"玩具总动员主题装修，儿童套餐选择丰富。带孩子在这里吃特别有氛围，胡迪和巴斯光年周边装饰超可爱。",
    reviews:[
      { author:"带娃迪士尼", source:"xiaohongshu", rating:4,
        text:"玩具盒欢宴广场儿童套餐很可爱！孩子特别喜欢胡迪主题装修，食物味道一般但氛围感足，带娃的话在这里吃午饭很合适。",
        tags:["儿童友好","主题","亲子"] },
    ],
  },
  {
    id:"man-yue", name:"漫月食府",
    parkId:"shanghai", area:"garden", areaName:"奇想花园",
    type:"fancy", requiresReservation:true,
    reservationTips:"奇想花园内中式园林建筑，需提前在官方App预约。",
    cuisine:"中式正餐", priceRange:"¥¥¥", duration:60,
    bestMealTime:["lunch","dinner"], suitableModes:["family","casual","shopping"],
    rating:4.2, photoWorthy:true,
    tags:["中式","园林","奇想花园","需预约","传统建筑","高端中餐"],
    tips:"古色古香的中式园林建筑，把迪士尼人物融入中国传统元素。适合喜欢中式菜系的家庭。",
    reviews:[
      { author:"中式迪士尼", source:"xiaohongshu", rating:4,
        text:"漫月食府的环境真的很美！中式园林建筑在迪士尼里很特别，食物也挺正宗，比其他餐厅多了一份文化感。需要提前预约。",
        tags:["中式","环境美","园林","文化感"] },
    ],
  },

  // ── 快餐/小吃 ───────────────────────────────────────────────────────────────
  {
    id:"lucky-star", name:"米奇好伙伴美味集市",
    parkId:"shanghai", area:"mickey", areaName:"米奇大街",
    type:"quick", requiresReservation:false,
    cuisine:"中式套餐/快餐", priceRange:"¥", duration:20,
    bestMealTime:["lunch","snack"], suitableModes:["thrill","casual"],
    rating:3.6, photoWorthy:false,
    tags:["快餐","省时","性价比","米奇大街","中式"],
    tips:"最快解决午餐，中式套餐选择多。刺激项目爱好者首选，不浪费游玩时间。米奇大街位置方便。",
    reviews:[
      { author:"效率玩迪士尼", source:"xiaohongshu", rating:3,
        text:"快餐图一个快，米奇大街位置超方便。中式套餐还行，迪士尼里能快速吃完继续冲项目真的很重要",
        tags:["快速","便捷","性价比"] },
    ],
  },
  {
    id:"tutunga", name:"土图嘉风味小馆",
    parkId:"shanghai", area:"treasure", areaName:"宝藏湾",
    type:"quick", requiresReservation:false,
    cuisine:"特色小吃/火鸡腿", priceRange:"¥", duration:15,
    bestMealTime:["snack","lunch"], suitableModes:["casual","thrill","shopping"],
    rating:4.4, photoWorthy:true,
    tags:["火鸡腿","招牌","宝藏湾","必吃","网红","拍照"],
    tips:"招牌火鸡腿80元，比脸还大。外皮酥脆肉质饱满，是全园最网红的单品小吃。手持火鸡腿在宝藏湾拍照是经典打卡pose。",
    reviews:[
      { author:"迪士尼火鸡腿", source:"xiaohongshu", rating:5,
        text:"土图嘉火鸡腿真的是迪士尼必吃！80块钱超值，份量巨大，外皮酥脆里面嫩，手持在宝藏湾拍照超出片。每次来必买！！",
        tags:["必吃","火鸡腿","出片","宝藏湾"] },
      { author:"迪士尼美食博主", source:"weibo", rating:5,
        text:"土图嘉火鸡腿，来迪士尼不买就是遗憾！宝藏湾的招牌，配上海盗船背景拍照绝了，味道也真的不错，强推",
        tags:["必吃","推荐","火鸡腿"] },
    ],
  },
];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
export const getRidesByPark   = (id: string) => RIDES.filter((r) => r.parkId === id);
export const getRideById      = (id: string) => RIDES.find((r) => r.id === id);
export const getParkById      = (id: string) => PARKS.find((p) => p.id === id);
export const getPhotoSpots    = (id: string) => PHOTO_SPOTS.filter((p) => p.parkId === id);
export const getShopSpots     = (id: string) => SHOP_SPOTS.filter((s) => s.parkId === id);
export const getRestaurants   = (id: string) => RESTAURANTS.filter((r) => r.parkId === id);
