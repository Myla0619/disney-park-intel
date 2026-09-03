/**
 * Claude Tool Use 工具定义
 *
 * 这些描述会直接进入模型上下文，决定工具选择的准确率——改动前请跑
 * scripts/eval_tool_accuracy.py 看指标是否回退。
 */

import type Anthropic from "@anthropic-ai/sdk";

export const DISNEY_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_wait_times",
    description: "获取上海迪士尼乐园项目的实时或历史预测等待时间。当用户询问排队、等待时间、哪个项目人少时调用。",
    input_schema: {
      type: "object" as const,
      properties: {
        rideId: { type: "string", description: "项目ID，可选。不填则返回全园等待时间概况。" },
        mode:   { type: "string", enum: ["live","historical"], description: "live=当前实时，historical=历史预测" },
      },
      required: ["mode"],
    },
  },
  {
    name: "search_reviews",
    description: "搜索特定项目或餐厅的用户评论，使用RAG语义检索找到最相关的评论。当用户询问某个项目好不好玩、值不值得时调用。",
    input_schema: {
      type: "object" as const,
      properties: {
        targetId:   { type: "string", description: "项目ID或餐厅ID" },
        targetType: { type: "string", enum: ["ride","restaurant"] },
        query:      { type: "string", description: "用户关心的问题，如'适合孩子吗'、'等待时间长吗'" },
        topK:       { type: "number", description: "返回评论数量，默认5" },
      },
      required: ["targetId","targetType","query"],
    },
  },
  {
    name: "plan_itinerary",
    description: "根据用户偏好和当前状态生成或重新规划今日行程。当用户要求规划行程、重新安排时调用。",
    input_schema: {
      type: "object" as const,
      properties: {
        currentArea:      { type: "string", description: "当前区域ID" },
        remainingHours:   { type: "number", description: "剩余游玩小时数" },
        avoidRides:       { type: "array", items: { type: "string" }, description: "不想玩的项目ID" },
        mustRides:        { type: "array", items: { type: "string" }, description: "一定要玩的项目ID" },
        maxWaitMinutes:   { type: "number", description: "最大接受等待时间（分钟）" },
      },
      required: [],
    },
  },
  {
    name: "get_spot_info",
    description: "获取拍照点、购物店、餐厅的详细信息和导航建议。当用户询问某个地点怎么去、有什么推荐时调用。",
    input_schema: {
      type: "object" as const,
      properties: {
        spotId:      { type: "string", description: "地点ID" },
        spotType:    { type: "string", enum: ["photo","shop","restaurant","ride"] },
        currentArea: { type: "string", description: "用户当前区域，用于计算步行时间" },
      },
      required: ["spotId","spotType"],
    },
  },
];

export type ToolName = "get_wait_times" | "search_reviews" | "plan_itinerary" | "get_spot_info";
