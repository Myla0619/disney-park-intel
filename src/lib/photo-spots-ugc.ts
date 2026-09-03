/**
 * 来自游客笔记的拍照机位
 *
 * 本文件由 scripts/merge_photo_spots.mjs 生成，请勿手工编辑。
 * 来源是 data/reviews/ 里抓取的真实小红书笔记，经 scripts/extract_photo_spots.mjs
 * 提取，每条都通过了「原文片段必须逐字出现在语料中」的校验，并保留出处。
 *
 * 与 PHOTO_SPOTS 中人工整理的机位不同，这些条目几乎都没有时段信息。这不是提取
 * 做得不好，而是内容本身的特点：攻略帖回答的是「在哪拍」，很少写「几点拍」——
 * 34 条视觉提取结果里只有 3 条带任何时间描述。
 *
 * 由此得到的分工：UGC 提供广度（有哪些机位），人工整理提供深度（什么时段最佳）。
 * bestTimeSlots 为空时 poi-scoring 返回中性分 0.5，既不加分也不惩罚，
 * 这些机位靠类型与档案契合度参与排序。
 *
 * 注意：这是游客经验，不是官方数据，准确性未经核实。
 */

import { PhotoSpot } from "@/types";

export type UgcPhotoSpot = PhotoSpot & {
  source: {
    /** 支撑该条目的原文片段（文本提取）或图上可见依据（视觉提取） */
    quote: string;
    url: string;
    extraction: "text" | "vision";
  };
};

export const UGC_PHOTO_SPOTS: UgcPhotoSpot[] = [
  {
    "id": "ugc-1",
    "name": "疯狂动物城-热力追踪 拍照点（最后夏奇拉舞台表演两侧）",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "buzz-lightyear",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "最后一次街道追逐后就可以准备姿势了。相机在你乘坐的车头",
    "xhsKeyword": "疯狂动物城-热力追踪 拍照点（最后夏奇拉舞台表演两侧）",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "疯狂动物城-热力追踪 拍照点在最后的夏奇拉舞台表演两侧，最后一次街道追逐后就可以准备姿势了。相机在你乘坐的车头",
      "url": "https://www.xiaohongshu.com/discovery/item/69196e9100000000070201e1?xsec_token=YB-bHad0nvTltXhY_J1Ga8vT-cV8Glqe_qJBsvvRpkVac%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-2",
    "name": "城堡见艾莎安娜",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "frozen",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "把宝贝打扮成同款人物",
    "xhsKeyword": "城堡见艾莎安娜",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "千万别错过这个和艾莎近距离贴贴地机会~ 把宝贝打扮成同款人物",
      "url": "https://www.xiaohongshu.com/discovery/item/69478bb2000000001e039a75?xsec_token=YBCGS8cGQwP8eZ0jhaYEtaZcO4ulOy3Bw48N9B8lZljkg%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-3",
    "name": "米奇（十周年礼服）互动点位",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "slinky-dash",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "米奇（十周年礼服）互动点位",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "米奇（十周年礼服）：奇想花园",
      "url": "https://www.xiaohongshu.com/discovery/item/6a7457900000000025010d0b?xsec_token=YBb3Q-ZFCOCM0ZnmmXDxtTv6vF73lBZ_v3b6Ks-b6UCyo%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-4",
    "name": "唐老鸭/黛丝互动点位（梦幻世界小村）",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "nearestRide": "slinky-dash",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "唐老鸭/黛丝互动点位（梦幻世界小村）",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "唐老鸭/黛丝：梦幻世界小村",
      "url": "https://www.xiaohongshu.com/discovery/item/6a7457900000000025010d0b?xsec_token=YBb3Q-ZFCOCM0ZnmmXDxtTv6vF73lBZ_v3b6Ks-b6UCyo%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-5",
    "name": "米妮/米奇（夏日）互动点位——小飞侠斜对面游客服务亭背后",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "nearestRide": "slinky-dash",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "米妮/米奇（夏日）互动点位——小飞侠斜对面游客服务亭背后",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "米妮/米奇（夏日）：小飞侠斜对面游客服务亭背后",
      "url": "https://www.xiaohongshu.com/discovery/item/6a7457900000000025010d0b?xsec_token=YBb3Q-ZFCOCM0ZnmmXDxtTv6vF73lBZ_v3b6Ks-b6UCyo%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-6",
    "name": "城堡空镜",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "soaring-adv",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "错峰",
    "tags": [
      "游客笔记"
    ],
    "tips": "10:00 错峰吃早餐，拍城堡空镜",
    "xhsKeyword": "城堡空镜",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "🍰 10:00 错峰吃早餐，拍城堡空镜",
      "url": "https://www.xiaohongshu.com/discovery/item/68412f4c0000000022034a22?xsec_token=YBafDHtWaQPfFCdQJMnV8ZVOYd5-lOo7X7q5z8LPpYR3Y%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-7",
    "name": "热力追踪项目里尼克朱迪的工位",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "zootopia-ride",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "热力追踪项目里尼克朱迪的工位",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "热力追踪项目里尼克朱迪的工位真的是细节满满！",
      "url": "https://www.xiaohongshu.com/discovery/item/691c421f000000001e00b168?xsec_token=YBWonD2pBPmScKwjotbmgx39gnfkv4IXBcCEL6VUX1q58%3D&xsec_source=app_share",
      "extraction": "text"
    }
  },
  {
    "id": "ugc-8",
    "name": "10周年彩带装饰下的奇幻童话城堡（气球摊位前）",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "晴天蓝天，画面中光线明亮",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "10周年彩带装饰下的奇幻童话城堡（气球摊位前）",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "图一：画面上方为10周年金色米奇标志的粉蓝彩带装饰，中景为奇幻童话城堡，前景为成簇的迪士尼气球和人群",
      "url": "https://www.xiaohongshu.com/explore/69b9474b0000000021007a13",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-9",
    "name": "10周年“加你更奇妙 With You, It's Magic”米奇米妮打卡装置",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "10周年“加你更奇妙 With You, It's Magic”米奇米妮打卡装置",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "图二：可见蓝紫色“10”造型装置，米奇米妮穿10周年蓝金服装，横幅上写“加你更奇 With You, It's Mag…”，背景是城堡，两侧树木形成框景",
      "url": "https://www.xiaohongshu.com/explore/69b9474b0000000021007a13",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-10",
    "name": "奇想花园10周年路灯装饰牌（花栗鼠浮雕）与气球+城堡",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "晴天蓝紫色天空",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "奇想花园10周年路灯装饰牌（花栗鼠浮雕）与气球+城堡",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "图三：右侧路灯上挂有金色蝴蝶结与10周年星徽的蓝金圆形花栗鼠浮雕装饰牌，左侧为大簇气球，背景虚化的奇幻童话城堡",
      "url": "https://www.xiaohongshu.com/explore/69b9474b0000000021007a13",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-11",
    "name": "奇幻童话城堡旁蝴蝶雕塑机位（柳枝框景）",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "奇幻童话城堡旁蝴蝶雕塑机位（柳枝框景）",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "画面中人物站在岩石与铁艺栏杆前，背后是奇幻童话城堡尖塔和一只巨大的金色蝴蝶雕塑，前景有垂柳枝叶与复古路灯形成框景；图上无任何文字说明",
      "url": "https://www.xiaohongshu.com/explore/6926dcec000000001e03415e",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-12",
    "name": "旋转蜂蜜罐",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "旋转蜂蜜罐",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "第二张图「旋转蜂蜜」画面为蜂蜜罐旋转设施与灯笼顶棚；地图标号5「旋转蜂蜜罐」",
      "url": "https://www.xiaohongshu.com/explore/679df6510000000029031462",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-13",
    "name": "飞跃地平线",
    "parkId": "shanghai",
    "area": "adventure",
    "areaName": "探险岛",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "飞跃地平线",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "第二张图「飞跃地平线」画面为长城飞行影像与座舱；地图标号1「飞跃地平线」",
      "url": "https://www.xiaohongshu.com/explore/679df6510000000029031462",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-14",
    "name": "小飞象",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "小飞象",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "第一张地图上红点标注「小飞象」",
      "url": "https://www.xiaohongshu.com/explore/679df6510000000029031462",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-15",
    "name": "奇幻童话城堡侧面石阶步道（城堡后方带白色栏杆的台阶通道）",
    "parkId": "shanghai",
    "area": "fantasy",
    "areaName": "梦幻世界",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "傍晚天色偏粉紫（图中天空为粉紫晚霞，部分为后期",
    "tags": [
      "游客笔记"
    ],
    "tips": "站在台阶通道中间、城堡作为背景居中构图，人物位于画面下方留出城堡全身；可正面走向镜头微笑、背对镜头转裙摆，也可靠白色石栏杆拍近景自拍（比心/托腮/嘟嘴）；第二张图显示可用修图App的",
    "xhsKeyword": "奇幻童话城堡侧面石阶步道（城堡后方带白色栏杆的台阶通道）",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "三组图均为同一位置：城堡在背景、前方白色石雕栏杆与灰石砖台阶通道，人物在台阶上正面行走、背身转裙、栏杆边自拍；第二张图有",
      "url": "https://www.xiaohongshu.com/explore/5ee37e1e0000000001007eca",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-16",
    "name": "许愿星港湖畔倒影机位（奇想花园水池对岸拍奇幻童话城堡）",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "图1为日落黄昏、天空橙金色晚霞时；图2、图3为夜晚烟花表演时，湖面无风呈镜面状可出完整倒影",
    "tags": [
      "游客笔记"
    ],
    "tips": "站在城堡对岸的水池边，把城堡放在画面正中，竖构图，下半部分留给水面拍城堡与烟花的对称倒影；前景可纳入水中的莲花灯饰造型，画面中间的雕塑与城堡尖顶对齐居中",
    "xhsKeyword": "许愿星港湖畔倒影机位（奇想花园水池对岸拍奇幻童话城堡）",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "三张图均为同一机位：隔湖正对奇幻童话城堡，前景水面有莲花状灯饰浮岛，城堡与烟花在水中形成对称倒影；图1为夕阳橙色天空，图2/图3为夜间烟花绽放",
      "url": "https://www.xiaohongshu.com/explore/67320a84000000001b010e1e",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-17",
    "name": "城堡前（乐拍通经典打卡点位）",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [
      "19:30-20:00"
    ],
    "bestConditions": "图上写明晚上拍户外城堡「暗暗的不太出片」；18:00之后基本没有用得到乐拍通的地方，项目抓拍点位18:00之后下班；20:00之后是离园高峰、合卡人多",
    "tags": [
      "游客笔记"
    ],
    "tips": "乐拍通是迪士尼官方摄影，园内多个点位可在迪士尼app上查看，经典打卡地点如城堡前；288r最多拍6个人，可在xhs发帖拼车48r/人（所有照片里只能出现同一个人头）；拼车了乐拍通最好19:30之前去合卡。非互动点位的乐拍通更偏公式化游客照，想出片可直接找约拍，1h大概四五个点位就足够",
    "xhsKeyword": "城堡前（乐拍通经典打卡点位）",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "「园内有多个点位可以在迪士尼app上查看，包括经典打卡地点如城堡前」「晚上拍户外城堡啥的又暗暗的不太出片」「拼车了乐拍通最好19:30之前去合卡，20:00之后是离园高峰」",
      "url": "https://www.xiaohongshu.com/explore/68209583000000000c0397a4",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-18",
    "name": "疯狂动物城城市街景（高楼建筑群）",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "",
    "xhsKeyword": "疯狂动物城城市街景（高楼建筑群）",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "左上角画面为疯狂动物城彩色高楼建筑群与城市天际线",
      "url": "https://www.xiaohongshu.com/explore/6a782cdc000000002702198d",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-19",
    "name": "「禁止吃草 NO GRAZING」告示牌",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "戴兔耳帽子，手拿树叶做吃草/啃叶子的动作与告示牌互动",
    "xhsKeyword": "「禁止吃草 NO GRAZING」告示牌",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "右上画面有红圈禁止标志写「禁止吃草 NO GRAZING」，旁边女生戴兔耳帽手持树叶做吃的动作",
      "url": "https://www.xiaohongshu.com/explore/6a782cdc000000002702198d",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-20",
    "name": "城堡前甜甜圈",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "晴天蓝天白云，日间自然光",
    "tags": [
      "游客笔记"
    ],
    "tips": "以奇幻童话城堡为背景，站在花坛外围铁艺围栏前拍摄；可正面站姿、也可背对镜头伸手指向甜甜圈装置，画面中还有闪电树懒与狐狸尼克蛋形摆件可入镜",
    "xhsKeyword": "城堡前甜甜圈",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "第二张图中央大字\"城堡前甜甜圈\"，画面为迪士尼疯狂动物城巨型甜甜圈装置＋童话城堡＋粉白花坛，含正面站姿与背影伸手指装置的示范",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-21",
    "name": "疯狂动物城红绿灯",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "大晴天强光，蓝天背景",
    "tags": [
      "游客笔记"
    ],
    "tips": "可扶着绿色灯柱站立，远景带上疯狂动物城城市建筑群；也可蹲坐在红绿灯灯柱底座旁，手持红色棒棒糖抬头互动；戴米妮头箍或朱迪警帽出镜",
    "xhsKeyword": "疯狂动物城红绿灯",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "第三张图中央大字\"疯狂动物城红绿灯\"，四格分别是扶绿色灯柱站姿、蹲坐灯柱旁举棒棒糖、站立举棒棒糖等示范",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-22",
    "name": "朱迪·霍普斯（JUDY HOPPS）壁画墙",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "站在朱迪壁画告示牌前拍摄，画面带上兔耳造型招牌",
    "xhsKeyword": "朱迪·霍普斯（JUDY HOPPS）壁画墙",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "封面图第一行中间格出现\"JUDY HOPPS\"招牌与朱迪壁画，人物站在前方合影",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-23",
    "name": "疯狂动物城警局前台（牛局长/朱迪窗口）",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "坐/站在警局服务窗口前，戴米妮头箍比耶自拍",
    "xhsKeyword": "疯狂动物城警局前台（牛局长/朱迪窗口）",
    "duration": 10,
    "photoType": "interactive",
    "source": {
      "quote": "封面图右上格为动物城警局窗口内的豹警官与角色摆件，人物戴米妮头箍比耶",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-24",
    "name": "疯狂动物城爪爪冰棒（红色爪印雪糕）",
    "parkId": "shanghai",
    "area": "zootopia",
    "areaName": "疯狂动物城",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "手持两支爪印造型冰棒对着卡通招牌拍摄特写",
    "xhsKeyword": "疯狂动物城爪爪冰棒（红色爪印雪糕）",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "封面图右中格为手举两支红色爪印冰棒，背景为疯狂动物城卡通店铺招牌",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-25",
    "name": "玩具总动员大屁股收音机（胡迪造型）",
    "parkId": "shanghai",
    "area": "toytown",
    "areaName": "迪士尼·皮克斯玩具总动员",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "两人坐在红色收音机道具前合影",
    "xhsKeyword": "玩具总动员大屁股收音机（胡迪造型）",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "封面图左下格为印有胡迪图案的红色巨型收音机／唱片机造型道具，两人在前合影",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-26",
    "name": "绿色恐龙抱抱龙草雕花园机位",
    "parkId": "shanghai",
    "area": "toytown",
    "areaName": "迪士尼·皮克斯玩具总动员",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "站在绿色恐龙造型植物雕塑与花丛前，粉色系穿搭出镜",
    "xhsKeyword": "绿色恐龙抱抱龙草雕花园机位",
    "duration": 10,
    "photoType": "scenic",
    "source": {
      "quote": "封面图下排中间格为绿色恐龙造型绿雕＋花坛，人物穿粉白色系衣裙戴草帽",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-27",
    "name": "米奇大街室内房间场景（达菲玩偶合影）",
    "parkId": "shanghai",
    "area": "mickey",
    "areaName": "米奇大街",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "坐在室内复古房间布景中，抱达菲家族玩偶合影",
    "xhsKeyword": "米奇大街室内房间场景（达菲玩偶合影）",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "封面图左中格为带挂画与木质墙面的室内布景，两人抱着达菲/雪莉玫玩偶坐着合影",
      "url": "https://www.xiaohongshu.com/explore/6659b7b70000000016012e50",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-28",
    "name": "十二朋友园马赛克壁画（蓝色公牛壁画）",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "站在拱形壁龛前、蓝色公牛壁画一侧，一手扶腰侧身站姿，可与壁画中的角色同框",
    "xhsKeyword": "十二朋友园马赛克壁画（蓝色公牛壁画）",
    "duration": 10,
    "photoType": "themed",
    "source": {
      "quote": "左上图：拱形框内的蓝色公牛马赛克壁画（上方可见\"THE BLU…\"字样），女生戴米妮头饰站在壁画前扶腰摆拍",
      "url": "https://www.xiaohongshu.com/explore/6a799eaf0000000025012698",
      "extraction": "vision"
    }
  },
  {
    "id": "ugc-29",
    "name": "城堡前打卡机位",
    "parkId": "shanghai",
    "area": "garden",
    "areaName": "奇想花园",
    "nearestRide": "",
    "walkFromNearestRide": 0,
    "bestTimeSlots": [],
    "bestConditions": "",
    "tags": [
      "游客笔记"
    ],
    "tips": "以远处城堡尖顶为背景举手打招呼自拍，戴米妮蝴蝶结帽子出镜",
    "xhsKeyword": "城堡前打卡机位",
    "duration": 10,
    "photoType": "landmark",
    "source": {
      "quote": "右上图：女生戴红色圆点米妮蝴蝶结帽自拍，背景是围栏后的奇幻童话城堡",
      "url": "https://www.xiaohongshu.com/explore/6a799eaf0000000025012698",
      "extraction": "vision"
    }
  }
];
