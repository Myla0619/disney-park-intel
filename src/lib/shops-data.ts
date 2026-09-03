/**
 * 上海迪士尼乐园园内商店
 *
 * 本文件由 scripts/generate_shops.mjs 生成，请勿手工编辑。
 * 数据源：上海迪士尼度假区官网商店列表（店名、主题园区、商品品类均为官方数据），
 * 原始抓取结果见 data/reference/shanghai-shops.json。
 *
 * 规模、停留时长、最佳时段、限定款标记均由官方品类推导，不含主观经验成分。
 * 迪士尼小镇与酒店内的商店不在乐园门票范围内，未收录。
 */

import { ShopSpot } from "@/types";

export const SHANGHAI_SHOPS: ShopSpot[] = [
  {
    "id": "shop-M大街购物廊",
    "name": "M大街购物廊",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "theme": "服装、配饰、纪念品",
    "categories": [
      "服装",
      "配饰",
      "纪念品",
      "钥匙圈/磁贴",
      "徽章",
      "头饰",
      "手表",
      "饰品",
      "文具",
      "收藏品",
      "家居用品",
      "玩具",
      "毛绒玩具",
      "礼服/角色扮演服",
      "食品/零食",
      "箱包",
      "日用品",
      "鞋履",
      "数码产品",
      "天气类商品",
      "个性定制商品",
      "商品快递"
    ],
    "scale": "flagship",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "opening",
    "duration": 30,
    "tags": [
      "服装",
      "配饰",
      "纪念品",
      "钥匙圈/磁贴",
      "徽章",
      "头饰",
      "手表",
      "饰品"
    ],
    "tips": "全园品类最全的旗舰店，开园时段货品最齐。可办理商品快递，不必全程拎着。有礼服与角色扮演服，适合换装拍照。有收藏品线，限定款通常在此上架。主营：服装、配饰、纪念品、钥匙圈/磁贴、徽章、头饰。"
  },
  {
    "id": "shop-甜心糖果",
    "name": "甜心糖果",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "theme": "服装、配饰、纪念品",
    "categories": [
      "服装",
      "配饰",
      "纪念品",
      "钥匙圈/磁贴",
      "头饰",
      "毛绒玩具",
      "家居用品",
      "食品/零食",
      "箱包",
      "日用品",
      "天气类商品",
      "商品快递"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "纪念品",
      "钥匙圈/磁贴",
      "头饰",
      "毛绒玩具",
      "家居用品",
      "食品/零食"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：服装、配饰、纪念品、钥匙圈/磁贴、头饰、毛绒玩具。"
  },
  {
    "id": "shop-老车站",
    "name": "老车站商店",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "theme": "服装、配饰、头饰",
    "categories": [
      "服装",
      "配饰",
      "头饰",
      "文具",
      "纪念品",
      "毛绒玩具",
      "玩具",
      "箱包",
      "日用品",
      "钥匙圈/磁贴",
      "家居用品",
      "商品快递"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "头饰",
      "文具",
      "纪念品",
      "毛绒玩具",
      "玩具",
      "箱包"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：服装、配饰、头饰、文具、纪念品、毛绒玩具。"
  },
  {
    "id": "shop-幸运兔车厢",
    "name": "幸运兔车厢",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "theme": "头饰、天气类商品、玩具",
    "categories": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-美妙记忆屋",
    "name": "美妙记忆屋",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "theme": "纪念品、迪士尼乐拍通、头饰",
    "categories": [
      "纪念品",
      "迪士尼乐拍通",
      "头饰",
      "日用品",
      "天气类商品",
      "商品快递"
    ],
    "scale": "small",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 12,
    "tags": [
      "纪念品",
      "迪士尼乐拍通",
      "头饰",
      "日用品",
      "天气类商品",
      "商品快递"
    ],
    "tips": "可办理商品快递，不必全程拎着。提供迪士尼乐拍通服务。主营：纪念品、头饰、日用品、天气类商品。"
  },
  {
    "id": "shop-琦妙美味屋-",
    "name": "琦妙美味屋——商店",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "theme": "毛绒玩具、家居用品、食品/零食",
    "categories": [
      "毛绒玩具",
      "家居用品",
      "食品/零食",
      "钥匙圈/磁贴"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "毛绒玩具",
      "家居用品",
      "食品/零食",
      "钥匙圈/磁贴"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：毛绒玩具、家居用品、食品/零食、钥匙圈/磁贴。"
  },
  {
    "id": "shop-漫威制造",
    "name": "漫威制造",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "theme": "服装、配饰、徽章",
    "categories": [
      "服装",
      "配饰",
      "徽章",
      "头饰",
      "文具",
      "收藏品",
      "家居用品",
      "纪念品",
      "玩具",
      "毛绒玩具",
      "礼服/角色扮演服",
      "天气类商品",
      "扭蛋机",
      "商品快递",
      "箱包"
    ],
    "scale": "major",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "徽章",
      "头饰",
      "文具",
      "收藏品",
      "家居用品",
      "纪念品"
    ],
    "tips": "可办理商品快递，不必全程拎着。店内有扭蛋机。有礼服与角色扮演服，适合换装拍照。有收藏品线，限定款通常在此上架。主营：服装、配饰、徽章、头饰、文具、收藏品。"
  },
  {
    "id": "shop-漫月食府-",
    "name": "漫月食府 - 商店",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "theme": "钥匙圈/磁贴、毛绒玩具",
    "categories": [
      "钥匙圈/磁贴",
      "毛绒玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "钥匙圈/磁贴",
      "毛绒玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：钥匙圈/磁贴、毛绒玩具。"
  },
  {
    "id": "shop-马戏团小货车",
    "name": "马戏团小货车",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "theme": "头饰、天气类商品、玩具",
    "categories": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-史卡托杂货",
    "name": "史卡托杂货",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "theme": "头饰、天气类商品、玩具",
    "categories": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-奇幻邂逅精品店",
    "name": "奇幻邂逅精品店",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "配饰、饰品、收藏品",
    "categories": [
      "配饰",
      "饰品",
      "收藏品",
      "纪念品",
      "箱包",
      "毛绒玩具",
      "食品/零食",
      "家居用品",
      "玩具",
      "钥匙圈/磁贴",
      "商品快递",
      "文具",
      "上海迪士尼乐园主题商品",
      "头饰",
      "礼服/角色扮演服",
      "服装"
    ],
    "scale": "major",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "配饰",
      "饰品",
      "收藏品",
      "纪念品",
      "箱包",
      "毛绒玩具",
      "食品/零食",
      "家居用品"
    ],
    "tips": "可办理商品快递，不必全程拎着。有礼服与角色扮演服，适合换装拍照。有收藏品线，限定款通常在此上架。主营：配饰、饰品、收藏品、纪念品、箱包、毛绒玩具。"
  },
  {
    "id": "shop-米奇米妮同心铺",
    "name": "米奇米妮同心铺",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "服装、配饰、纪念品",
    "categories": [
      "服装",
      "配饰",
      "纪念品",
      "钥匙圈/磁贴",
      "头饰",
      "家居用品",
      "玩具",
      "毛绒玩具",
      "箱包",
      "天气类商品",
      "商品快递"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "纪念品",
      "钥匙圈/磁贴",
      "头饰",
      "家居用品",
      "玩具",
      "毛绒玩具"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：服装、配饰、纪念品、钥匙圈/磁贴、头饰、家居用品。"
  },
  {
    "id": "shop-森林百物",
    "name": "森林百物",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "服装、配饰、玩具",
    "categories": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "纪念品",
      "徽章",
      "文具",
      "家居用品",
      "钥匙圈/磁贴",
      "头饰",
      "天气类商品",
      "箱包",
      "食品/零食",
      "商品快递",
      "日用品"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "纪念品",
      "徽章",
      "文具",
      "家居用品"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：服装、配饰、玩具、毛绒玩具、纪念品、徽章。"
  },
  {
    "id": "shop-缤纷变幻沙龙",
    "name": "缤纷变幻沙龙",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "上海迪士尼乐园主题商品、礼服/角色扮演服、迪士尼乐拍通",
    "categories": [
      "上海迪士尼乐园主题商品",
      "礼服/角色扮演服",
      "迪士尼乐拍通"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "上海迪士尼乐园主题商品",
      "礼服/角色扮演服",
      "迪士尼乐拍通"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。提供迪士尼乐拍通服务。有礼服与角色扮演服，适合换装拍照。主营：上海迪士尼乐园主题商品、礼服/角色扮演服。"
  },
  {
    "id": "shop-梦幻集",
    "name": "梦幻集",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "上海迪士尼乐园主题商品、钥匙圈/磁贴、头饰",
    "categories": [
      "上海迪士尼乐园主题商品",
      "钥匙圈/磁贴",
      "头饰",
      "文具",
      "纪念品",
      "玩具"
    ],
    "scale": "small",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 12,
    "tags": [
      "上海迪士尼乐园主题商品",
      "钥匙圈/磁贴",
      "头饰",
      "文具",
      "纪念品",
      "玩具"
    ],
    "tips": "主营：上海迪士尼乐园主题商品、钥匙圈/磁贴、头饰、文具、纪念品、玩具。"
  },
  {
    "id": "shop-小贵客礼品屋",
    "name": "小贵客礼品屋",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "配饰、商品快递、毛绒玩具",
    "categories": [
      "配饰",
      "商品快递",
      "毛绒玩具",
      "上海迪士尼乐园主题商品",
      "头饰",
      "饰品"
    ],
    "scale": "small",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 12,
    "tags": [
      "配饰",
      "商品快递",
      "毛绒玩具",
      "上海迪士尼乐园主题商品",
      "头饰",
      "饰品"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：配饰、毛绒玩具、上海迪士尼乐园主题商品、头饰、饰品。"
  },
  {
    "id": "shop-木屋奇玩",
    "name": "木屋奇玩",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "头饰、天气类商品、玩具",
    "categories": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-矿山宝藏",
    "name": "矿山宝藏",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "theme": "头饰、天气类商品、玩具",
    "categories": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-达菲好友欢庆堂-",
    "name": "达菲好友欢庆堂——商店",
    "parkId": "shanghai",
    "area": "adventure",
    "areaName": "探险岛",
    "theme": "服装、配饰、毛绒玩具",
    "categories": [
      "服装",
      "配饰",
      "毛绒玩具",
      "家居用品",
      "头饰",
      "纪念品",
      "箱包",
      "钥匙圈/磁贴",
      "天气类商品",
      "商品快递"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "毛绒玩具",
      "家居用品",
      "头饰",
      "纪念品",
      "箱包",
      "钥匙圈/磁贴"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：服装、配饰、毛绒玩具、家居用品、头饰、纪念品。"
  },
  {
    "id": "shop-奇奇蒂蒂淘淘铺",
    "name": "奇奇蒂蒂淘淘铺",
    "parkId": "shanghai",
    "area": "adventure",
    "areaName": "探险岛",
    "theme": "服装、配饰、玩具",
    "categories": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "钥匙圈/磁贴",
      "头饰",
      "纪念品",
      "家居用品",
      "鞋履",
      "箱包",
      "天气类商品",
      "食品/零食",
      "商品快递",
      "日用品"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "钥匙圈/磁贴",
      "头饰",
      "纪念品",
      "家居用品"
    ],
    "tips": "可办理商品快递，不必全程拎着。主营：服装、配饰、玩具、毛绒玩具、钥匙圈/磁贴、头饰。"
  },
  {
    "id": "shop-霓蛙彩物",
    "name": "霓蛙彩物",
    "parkId": "shanghai",
    "area": "adventure",
    "areaName": "探险岛",
    "theme": "头饰、天气类商品、玩具",
    "categories": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-达布隆集市",
    "name": "达布隆集市",
    "parkId": "shanghai",
    "area": "treasure",
    "areaName": "宝藏湾",
    "theme": "服装、配饰、玩具",
    "categories": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "头饰",
      "纪念品",
      "饰品",
      "家居用品",
      "礼服/角色扮演服",
      "天气类商品",
      "食品/零食",
      "钥匙圈/磁贴",
      "商品快递",
      "日用品"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "头饰",
      "纪念品",
      "饰品",
      "家居用品"
    ],
    "tips": "可办理商品快递，不必全程拎着。有礼服与角色扮演服，适合换装拍照。主营：服装、配饰、玩具、毛绒玩具、头饰、纪念品。"
  },
  {
    "id": "shop-逍遥吉普赛",
    "name": "逍遥吉普赛",
    "parkId": "shanghai",
    "area": "treasure",
    "areaName": "宝藏湾",
    "theme": "徽章、头饰、天气类商品",
    "categories": [
      "徽章",
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [
      "徽章",
      "头饰",
      "天气类商品",
      "玩具"
    ],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。主营：徽章、头饰、天气类商品、玩具。"
  },
  {
    "id": "shop-创能补给站",
    "name": "创能补给站",
    "parkId": "shanghai",
    "area": "tomorrow",
    "areaName": "明日世界",
    "theme": "服装、配饰、玩具",
    "categories": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "头饰",
      "纪念品",
      "徽章",
      "家居用品",
      "钥匙圈/磁贴",
      "天气类商品",
      "食品/零食",
      "商品快递",
      "日用品",
      "迪士尼乐拍通"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "头饰",
      "纪念品",
      "徽章",
      "家居用品"
    ],
    "tips": "可办理商品快递，不必全程拎着。提供迪士尼乐拍通服务。主营：服装、配饰、玩具、毛绒玩具、头饰、纪念品。"
  },
  {
    "id": "shop-星际贸易港",
    "name": "星际贸易港",
    "parkId": "shanghai",
    "area": "tomorrow",
    "areaName": "明日世界",
    "theme": "服装、配饰、玩具",
    "categories": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "头饰",
      "徽章",
      "家居用品",
      "纪念品",
      "手表",
      "天气类商品",
      "食品/零食",
      "商品快递",
      "日用品",
      "迪士尼乐拍通"
    ],
    "scale": "major",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "头饰",
      "徽章",
      "家居用品",
      "纪念品"
    ],
    "tips": "可办理商品快递，不必全程拎着。提供迪士尼乐拍通服务。主营：服装、配饰、玩具、毛绒玩具、头饰、徽章。"
  },
  {
    "id": "shop-明日世界展馆",
    "name": "明日世界展馆商店",
    "parkId": "shanghai",
    "area": "tomorrow",
    "areaName": "明日世界",
    "theme": "纪念品、玩具、徽章",
    "categories": [
      "纪念品",
      "玩具",
      "徽章",
      "服装",
      "钥匙圈/磁贴",
      "毛绒玩具"
    ],
    "scale": "small",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 12,
    "tags": [
      "纪念品",
      "玩具",
      "徽章",
      "服装",
      "钥匙圈/磁贴",
      "毛绒玩具"
    ],
    "tips": "主营：纪念品、玩具、徽章、服装、钥匙圈/磁贴、毛绒玩具。"
  },
  {
    "id": "shop-晶品",
    "name": "晶品",
    "parkId": "shanghai",
    "area": "tomorrow",
    "areaName": "明日世界",
    "theme": "未列出品类",
    "categories": [],
    "scale": "kiosk",
    "hasLimitedEdition": false,
    "bestTimeToVisit": "anytime",
    "duration": 6,
    "tags": [],
    "tips": "路边小货车，品类少，顺路停留几分钟即可。"
  },
  {
    "id": "shop-艾尔玩具店",
    "name": "艾尔玩具店",
    "parkId": "shanghai",
    "area": "toytown",
    "areaName": "迪士尼·皮克斯玩具总动员",
    "theme": "服装、配饰、玩具",
    "categories": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "钥匙圈/磁贴",
      "头饰",
      "食品/零食",
      "纪念品",
      "家居用品",
      "收藏品",
      "礼服/角色扮演服",
      "日用品",
      "天气类商品",
      "商品快递",
      "扭蛋机"
    ],
    "scale": "major",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "服装",
      "配饰",
      "玩具",
      "毛绒玩具",
      "钥匙圈/磁贴",
      "头饰",
      "食品/零食",
      "纪念品"
    ],
    "tips": "可办理商品快递，不必全程拎着。店内有扭蛋机。有礼服与角色扮演服，适合换装拍照。有收藏品线，限定款通常在此上架。主营：服装、配饰、玩具、毛绒玩具、钥匙圈/磁贴、头饰。"
  },
  {
    "id": "shop-露露精品店",
    "name": "露露精品店",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "theme": "手表、钥匙圈/磁贴、纪念品",
    "categories": [
      "手表",
      "钥匙圈/磁贴",
      "纪念品",
      "头饰",
      "礼服/角色扮演服",
      "服装",
      "箱包",
      "食品/零食",
      "收藏品",
      "家居用品",
      "玩具",
      "文具",
      "上海迪士尼乐园主题商品",
      "徽章"
    ],
    "scale": "major",
    "hasLimitedEdition": true,
    "bestTimeToVisit": "anytime",
    "duration": 20,
    "tags": [
      "手表",
      "钥匙圈/磁贴",
      "纪念品",
      "头饰",
      "礼服/角色扮演服",
      "服装",
      "箱包",
      "食品/零食"
    ],
    "tips": "有礼服与角色扮演服，适合换装拍照。有收藏品线，限定款通常在此上架。主营：手表、钥匙圈/磁贴、纪念品、头饰、礼服/角色扮演服、服装。"
  }
];
