/**
 * 会话记忆
 *
 * 在多轮对话中累积用户透露的偏好（最长可接受排队、不想玩的项目、同行人员、
 * 当前位置），下一轮直接进系统提示词，用户不必重填 Onboarding。
 */

import { UserProfile } from "@/types";
import { getSessionStore } from "./session-store";

export type PreferenceUpdate = {
  type: "max_wait"        // "我不想排队超过X分钟"
       | "avoid_ride"     // "我不想玩XX"
       | "must_ride"      // "我一定要玩XX"
       | "location"       // "我现在在XX"
       | "time_left"      // "我还有X小时"
       | "group_change"   // "我女朋友怕高"
       | "dining"         // "我想吃XX"
       | "custom";
  value: string | number | boolean;
  rideId?: string;
  timestamp: number;
};

export type SessionMemory = {
  sessionId: string;
  baseProfile: UserProfile;
  updates: PreferenceUpdate[];
  currentArea?: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  inferredPreferences: {
    maxWaitMinutes?: number;
    avoidRides: string[];
    mustRides: string[];
    fearHeight?: boolean;
    fearWater?: boolean;
    travelWith?: string; // "girlfriend", "elderly", "toddler"
  };
};

// ─── 持久化 ───────────────────────────────────────────────────────────────
// 后端由 session-store.ts 决定：默认进程内，配置了 Upstash 则走 Redis。
// 一次游园不会超过一天，24 小时 TTL 足够，也不至于让废弃会话一直占空间。
const TTL_SECONDS = 24 * 60 * 60;

const key = (sessionId: string) => `session:${sessionId}`;

export async function createSession(sessionId: string, profile: UserProfile): Promise<SessionMemory> {
  const memory: SessionMemory = {
    sessionId,
    baseProfile: profile,
    updates: [],
    conversationHistory: [],
    inferredPreferences: {
      avoidRides: [],
      mustRides: [],
    },
  };
  await getSessionStore().set(key(sessionId), memory, TTL_SECONDS);
  return memory;
}

export async function getSession(sessionId: string): Promise<SessionMemory | null> {
  return getSessionStore().get<SessionMemory>(key(sessionId));
}

export async function saveSession(session: SessionMemory): Promise<void> {
  await getSessionStore().set(key(session.sessionId), session, TTL_SECONDS);
}

export async function updateSession(
  sessionId: string,
  update: PreferenceUpdate
): Promise<SessionMemory | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.updates.push(update);

  // 推断偏好
  switch (update.type) {
    case "max_wait":
      session.inferredPreferences.maxWaitMinutes = Number(update.value);
      break;
    case "avoid_ride":
      if (update.rideId && !session.inferredPreferences.avoidRides.includes(update.rideId)) {
        session.inferredPreferences.avoidRides.push(update.rideId);
      }
      break;
    case "must_ride":
      if (update.rideId && !session.inferredPreferences.mustRides.includes(update.rideId)) {
        session.inferredPreferences.mustRides.push(update.rideId);
      }
      break;
    case "location":
      session.currentArea = String(update.value);
      break;
    case "group_change":
      const val = String(update.value).toLowerCase();
      if (val.includes("怕高") || val.includes("恐高")) session.inferredPreferences.fearHeight = true;
      if (val.includes("怕水") || val.includes("不想湿")) session.inferredPreferences.fearWater = true;
      if (val.includes("女朋友") || val.includes("女友")) session.inferredPreferences.travelWith = "girlfriend";
      if (val.includes("老人") || val.includes("爸妈") || val.includes("父母")) session.inferredPreferences.travelWith = "elderly";
      if (val.includes("宝宝") || val.includes("婴儿") || val.includes("幼儿")) session.inferredPreferences.travelWith = "toddler";
      break;
  }

  await saveSession(session);
  return session;
}

export async function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.conversationHistory.push({ role, content });
  // 只保留最近 20 条，避免上下文无限增长
  if (session.conversationHistory.length > 20) {
    session.conversationHistory = session.conversationHistory.slice(-20);
  }
  await saveSession(session);
}

// ─── 从对话中提取偏好更新（传给 Claude 解析）────────────────────────────────
export function buildMemoryContext(session: SessionMemory): string {
  const { inferredPreferences: p, currentArea, updates } = session;
  const lines: string[] = [];

  if (currentArea) lines.push(`当前位置：${currentArea}`);
  if (p.maxWaitMinutes) lines.push(`用户表示最多接受排队 ${p.maxWaitMinutes} 分钟`);
  if (p.avoidRides.length) lines.push(`用户不想玩：${p.avoidRides.join("、")}`);
  if (p.mustRides.length) lines.push(`用户一定要玩：${p.mustRides.join("、")}`);
  if (p.fearHeight) lines.push(`同行者有恐高/不喜欢失重感`);
  if (p.fearWater) lines.push(`同行者不想被水打湿`);
  if (p.travelWith) {
    const desc = { girlfriend:"女朋友", elderly:"老人/父母", toddler:"婴幼儿" }[p.travelWith];
    if (desc) lines.push(`同行有：${desc}`);
  }

  return lines.length ? `【本次对话中用户透露的偏好】\n${lines.join("\n")}` : "";
}
