/**
 * 示例评论数据
 *
 * 未配置 APIFY_TOKEN / RAPIDAPI_KEY 时，评论接口回退到这里，让 RAG 检索与
 * 情感汇总在没有付费数据源的情况下仍可运行与演示。
 *
 * 这些条目是**人工编写的示例**，不是抓取到的真实评论，接口会在响应里以
 * `fallback: true` 标注，UI 也据此显示「示例数据」提示——不要把它当作真实
 * 数据源来源引用。
 */

import { Review } from "@/types";

export const SEED_REVIEWS: Record<string, Review[]> = 
{
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
