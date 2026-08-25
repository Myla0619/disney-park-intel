/**
 * 来自游客笔记的拍照机位
 *
 * 本文件由 scripts/merge_photo_spots.mjs 生成，请勿手工编辑。
 * 来源是 data/reviews/ 里抓取的真实小红书笔记，经 scripts/extract_photo_spots.mjs
 * 提取，每条都通过了「原文片段必须逐字出现在语料中」的校验，并保留出处。
 *
 * 与 PHOTO_SPOTS 中人工整理的机位不同，这些条目多数没有时段信息——语料本身就
 * 没写。bestTimeSlots 为空时 poi-scoring 按中性处理，不参与时段加减分。
 *
 * 注意：这是游客经验，不是官方数据，准确性未经核实。
 */

import { PhotoSpot } from "@/types";

export type UgcPhotoSpot = PhotoSpot & {
  source: { quote: string; url: string };
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
      "url": "https://www.xiaohongshu.com/discovery/item/69196e9100000000070201e1?xsec_token=YB-bHad0nvTltXhY_J1Ga8vT-cV8Glqe_qJBsvvRpkVac%3D&xsec_source=app_share"
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
      "url": "https://www.xiaohongshu.com/discovery/item/69478bb2000000001e039a75?xsec_token=YBCGS8cGQwP8eZ0jhaYEtaZcO4ulOy3Bw48N9B8lZljkg%3D&xsec_source=app_share"
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
      "url": "https://www.xiaohongshu.com/discovery/item/6a7457900000000025010d0b?xsec_token=YBb3Q-ZFCOCM0ZnmmXDxtTv6vF73lBZ_v3b6Ks-b6UCyo%3D&xsec_source=app_share"
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
      "url": "https://www.xiaohongshu.com/discovery/item/6a7457900000000025010d0b?xsec_token=YBb3Q-ZFCOCM0ZnmmXDxtTv6vF73lBZ_v3b6Ks-b6UCyo%3D&xsec_source=app_share"
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
      "url": "https://www.xiaohongshu.com/discovery/item/6a7457900000000025010d0b?xsec_token=YBb3Q-ZFCOCM0ZnmmXDxtTv6vF73lBZ_v3b6Ks-b6UCyo%3D&xsec_source=app_share"
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
      "url": "https://www.xiaohongshu.com/discovery/item/68412f4c0000000022034a22?xsec_token=YBafDHtWaQPfFCdQJMnV8ZVOYd5-lOo7X7q5z8LPpYR3Y%3D&xsec_source=app_share"
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
      "url": "https://www.xiaohongshu.com/discovery/item/691c421f000000001e00b168?xsec_token=YBWonD2pBPmScKwjotbmgx39gnfkv4IXBcCEL6VUX1q58%3D&xsec_source=app_share"
    }
  }
];
