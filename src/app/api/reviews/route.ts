import { NextRequest, NextResponse } from "next/server";
import { Review } from "@/types";
import { RIDE_KEYWORDS, RESTAURANT_KEYWORDS } from "@/lib/parks-data";

export async function GET(req: NextRequest) {
  const rideId = req.nextUrl.searchParams.get("rideId");
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const id = rideId ?? restaurantId;
  const type = rideId ? "ride" : "restaurant";
  if (!id) return NextResponse.json({ error:"id required" }, { status:400 });

  const [xhsReviews, weiboReviews, taReviews] = await Promise.all([
    fetchXHSReviews(id, type),
    fetchWeiboReviews(id, type),
    fetchTripAdvisorReviews(id),
  ]);

  const all = [...xhsReviews, ...weiboReviews, ...taReviews]
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const summary = computeSummary(all);
  return NextResponse.json({ reviews:all, summary });
}

// ─── 小红书多关键词并发搜索 ───────────────────────────────────────────────────
async function fetchXHSReviews(id: string, type: string): Promise<Review[]> {
  const keywords = type === "ride"
    ? (RIDE_KEYWORDS[id] ?? [id])
    : (RESTAURANT_KEYWORDS[id] ?? [id]);

  if (process.env.APIFY_TOKEN) {
    try {
      const results = await Promise.all(
        keywords.map(async (kw) => {
          const res = await fetch(
            `https://api.apify.com/v2/acts/joshina~xiaohongshu-scraper/run-sync?token=${process.env.APIFY_TOKEN}`,
            { method:"POST", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({ searchQuery:`迪士尼 ${kw}`, maxResults:5 }) }
          );
          const data = await res.json();
          return (data.items ?? []).map(normalizeXHS);
        })
      );
      // 去重（按 url）
      const seen = new Set<string>();
      return results.flat().filter((r) => {
        if (!r.url || seen.has(r.url)) return false;
        seen.add(r.url); return true;
      });
    } catch (e) { console.error("XHS error:", e); }
  }
  return MOCK_REVIEWS[id]?.filter((r) => r.source === "xiaohongshu") ?? [];
}

// ─── 微博搜索 ─────────────────────────────────────────────────────────────────
async function fetchWeiboReviews(id: string, type: string): Promise<Review[]> {
  const keywords = type === "ride" ? (RIDE_KEYWORDS[id] ?? []) : (RESTAURANT_KEYWORDS[id] ?? []);
  const primaryKw = keywords[0] ?? id;

  if (process.env.WEIBO_COOKIE) {
    try {
      const query = encodeURIComponent(`上海迪士尼 ${primaryKw}`);
      const res = await fetch(
        `https://s.weibo.com/weibo?q=${query}&nodup=1&page=1`,
        { headers:{ Cookie:process.env.WEIBO_COOKIE, "User-Agent":"Mozilla/5.0" } }
      );
      // 实际解析逻辑需根据微博页面结构实现
      // 目前返回 mock
    } catch {}
  }
  return MOCK_REVIEWS[id]?.filter((r) => r.source === "weibo") ?? [];
}

// ─── TripAdvisor ──────────────────────────────────────────────────────────────
async function fetchTripAdvisorReviews(id: string): Promise<Review[]> {
  if (process.env.RAPIDAPI_KEY && TA_IDS[id]) {
    try {
      const res = await fetch(
        `https://tripadvisor16.p.rapidapi.com/api/v1/attraction/getAttractionReviews?attractionId=${TA_IDS[id]}&language=en`,
        { headers:{ "X-RapidAPI-Key":process.env.RAPIDAPI_KEY!, "X-RapidAPI-Host":"tripadvisor16.p.rapidapi.com" } }
      );
      const data = await res.json();
      return (data.data?.reviewList ?? []).slice(0,5).map(normalizeTA);
    } catch {}
  }
  return MOCK_REVIEWS[id]?.filter((r) => r.source === "tripadvisor") ?? [];
}

function normalizeXHS(item: any): Review {
  const text = `${item.title ?? ""} ${item.desc ?? ""}`.slice(0,300);
  return {
    source:"xiaohongshu", author:item.author?.nickname ?? "小红书用户",
    rating:item.likeCount > 1000 ? 5 : item.likeCount > 200 ? 4 : 3,
    text, date:item.time ?? new Date().toISOString(),
    tags:extractTags(text), sentiment:analyzeSentiment(text),
    url:`https://www.xiaohongshu.com/explore/${item.id}`,
  };
}

function normalizeTA(item: any): Review {
  return {
    source:"tripadvisor", author:item.userProfile?.displayName ?? "TripAdvisor User",
    rating:item.rating ?? 4, text:(item.text ?? "").slice(0,300),
    date:item.publishedDate ?? new Date().toISOString(),
    tags:extractTags(item.text ?? ""), sentiment:item.rating>=4?"positive":item.rating===3?"neutral":"negative",
  };
}

function analyzeSentiment(text: string): Review["sentiment"] {
  const pos = ["好玩","推荐","必玩","值得","棒","超好","amazing","great","loved","fantastic","好吃","美味","惊艳"];
  const neg = ["排队","太久","不值","失望","bad","waste","terrible","boring","一般","难吃","贵","坑"];
  const p = pos.filter((w) => text.includes(w)).length;
  const n = neg.filter((w) => text.includes(w)).length;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
}

function extractTags(text: string): string[] {
  const tagMap: Record<string,string[]> = {
    "kids-friendly":["小孩","宝宝","孩子","儿童","kid","child"],
    "long-wait":    ["排队","等候","久","long wait","waited"],
    "must-do":      ["必玩","必去","must","don't miss","best"],
    "thrill":       ["刺激","惊险","速度","thrill","fast"],
    "skip":         ["不值","失望","skip","overrated","waste"],
    "good-food":    ["好吃","美味","推荐","delicious"],
    "photo-worthy": ["出片","拍照","好看","美","scenic"],
    "reservation":  ["预约","订位","提前","reservation","book"],
  };
  return Object.entries(tagMap)
    .filter(([,kws]) => kws.some((kw) => text.toLowerCase().includes(kw.toLowerCase())))
    .map(([tag]) => tag);
}

function computeSummary(reviews: Review[]) {
  if (!reviews.length) return { positive:0, neutral:0, negative:0, avgRating:0, total:0 };
  const counts = { positive:0, neutral:0, negative:0 };
  let total = 0;
  for (const r of reviews) { counts[r.sentiment]++; total += r.rating; }
  return { ...counts, avgRating:+(total/reviews.length).toFixed(1), total:reviews.length };
}

const TA_IDS: Record<string,string> = { tron:"8763542", soaring:"7123841" };

// ─── Mock 数据（API 未配置时的降级）─────────────────────────────────────────
const MOCK_REVIEWS: Record<string,Review[]> = {
  tron:[
    { source:"xiaohongshu", author:"Disney狂热粉🎢", rating:5, date:"2024-05-20",
      text:"创极速光轮真的是来上海迪士尼必玩！骑上摩托车的感觉太爽了，速度超快，穿越光的隧道那段视觉效果绝了！建议一开门就冲，不然要等2小时以上",
      tags:["must-do","thrill","long-wait"], sentiment:"positive" },
    { source:"xiaohongshu", author:"妈妈带娃游记", rating:3, date:"2024-05-18",
      text:"带孩子来玩，小孩不够高（才98cm）进不去，好可惜。排了20分钟才看到身高限制牌，建议提前看好身高要求",
      tags:["kids-friendly","long-wait"], sentiment:"neutral" },
    { source:"weibo", author:"迪士尼今日打卡", rating:4, date:"2024-05-22",
      text:"今天TRON排队85分钟，下午稍微短了点大概70分钟，有Single Rider通道但没开放，建议买Single Pass",
      tags:["long-wait","thrill"], sentiment:"neutral" },
    { source:"tripadvisor", author:"TravelMum_HK", rating:5, date:"2024-05-15",
      text:"Absolutely the highlight of Shanghai Disneyland! Go first thing when the park opens — we waited only 20 mins at 9am but saw 90+ min queues by 11am.",
      tags:["must-do","thrill","long-wait"], sentiment:"positive" },
    { source:"tripadvisor", author:"AdventureSeeker99", rating:4, date:"2024-05-10",
      text:"Fantastic ride. Got Lightning Lane which was worth every penny — only 15 min vs 85 min standby.",
      tags:["thrill","reservation","must-do"], sentiment:"positive" },
  ],
  "seven-dwarfs":[
    { source:"xiaohongshu", author:"带娃必看攻略", rating:5, date:"2024-05-22",
      text:"七个小矮人是我们家孩子（6岁）最喜欢的！矿山车会左右摇摆，小朋友超级开心。97cm就可以坐，排队时间大概45分钟，里面有互动游戏可以玩",
      tags:["kids-friendly","family"], sentiment:"positive" },
    { source:"tripadvisor", author:"FamilyOf4_SG", rating:5, date:"2024-05-19",
      text:"Perfect family ride. Our 5 and 8 year olds absolutely loved it. The queue has interactive elements so kids stay entertained.",
      tags:["kids-friendly","family","must-do"], sentiment:"positive" },
  ],
  pirates:[
    { source:"xiaohongshu", author:"上海迪士尼老司机", rating:5, date:"2024-05-21",
      text:"加勒比海盗是全球最大版本！有真人特技演员出现，跟其他迪士尼完全不一样。没有身高限制，全家都能玩。整个航程大约15分钟，性价比超高！",
      tags:["family","kids-friendly","must-do","photo-worthy"], sentiment:"positive" },
    { source:"weibo", author:"宝藏湾打卡", rating:4, date:"2024-05-20",
      text:"宝藏湾海盗船超出片！加勒比海盗排队20分钟，进去之后真的很震撼，推荐！",
      tags:["photo-worthy","family"], sentiment:"positive" },
  ],
  soaring:[
    { source:"xiaohongshu", author:"第一次来迪士尼", rating:4, date:"2024-05-17",
      text:"飞越地平线适合所有年龄！悬挂式座椅，脚悬空，飞越世界各地美景，还有气味特效。不刺激但很治愈。我妈妈70岁第一次坐都很喜欢！",
      tags:["family","kids-friendly"], sentiment:"positive" },
  ],
  "belle-castle":[
    { source:"xiaohongshu", author:"迪士尼妈妈日记", rating:5, date:"2024-05-20",
      text:"贝儿餐厅真的太美了！装修超级梦幻，女儿看到公主直接感动哭了。食物味道中规中矩但整体体验满分，必须提前两周预约！",
      tags:["kids-friendly","reservation","photo-worthy"], sentiment:"positive" },
    { source:"tripadvisor", author:"PrincessDad", rating:4, date:"2024-05-15",
      text:"Beautiful themed restaurant. Book at least 2 weeks ahead. Food is decent but the experience is what you pay for.",
      tags:["themed","reservation","family"], sentiment:"positive" },
  ],
  "harbour-galley":[
    { source:"xiaohongshu", author:"上海迪士尼美食攻略", rating:4, date:"2024-05-21",
      text:"港湾餐厅靠窗的位子真的超出片！可以看到外面的海盗船，食物是正常水准，胜在环境好性价比不错，不需要预约直接去就行",
      tags:["photo-worthy","good-food"], sentiment:"positive" },
    { source:"weibo", author:"吃货游迪士尼", rating:4, date:"2024-05-19",
      text:"港湾的龙虾卷还不错！就是排队等位大概20分钟，建议11:30前去，避开午餐高峰",
      tags:["good-food","long-wait"], sentiment:"positive" },
  ],
};
