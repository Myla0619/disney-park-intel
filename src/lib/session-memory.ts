/**
 * 会话记忆管理
 * 在多轮对话中追踪用户偏好变化，无需重新填写 Onboarding
 * 简历亮点：Session-scoped context memory for conversational preference tracking
 */

import { UserProfile } from "@/types";

export type PreferenceUpdate = {
  type: "thrill_limit"    // "我不想排队超过X分钟"
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

// ─── 内存存储（生产环境替换为 Upstash Redis）────────────────────────────────
const sessions = new Map<string, SessionMemory>();

export function createSession(sessionId: string, profile: UserProfile): SessionMemory {
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
  sessions.set(sessionId, memory);
  return memory;
}

export function getSession(sessionId: string): SessionMemory | null {
  return sessions.get(sessionId) ?? null;
}

export function updateSession(sessionId: string, update: PreferenceUpdate): SessionMemory | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.updates.push(update);

  // 推断偏好
  switch (update.type) {
    case "thrill_limit":
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

  sessions.set(sessionId, session);
  return session;
}

export function addMessage(sessionId: string, role: "user" | "assistant", content: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.conversationHistory.push({ role, content });
  // 只保留最近20条（避免 context 过长）
  if (session.conversationHistory.length > 20) {
    session.conversationHistory = session.conversationHistory.slice(-20);
  }
  sessions.set(sessionId, session);
}

// ─── 把 session 偏好合并回 UserProfile ───────────────────────────────────────
export function mergeSessionToProfile(session: SessionMemory): UserProfile & {
  _avoidRides: string[];
  _mustRides: string[];
  _maxWaitMinutes?: number;
  _currentArea?: string;
} {
  return {
    ...session.baseProfile,
    _avoidRides: session.inferredPreferences.avoidRides,
    _mustRides: session.inferredPreferences.mustRides,
    _maxWaitMinutes: session.inferredPreferences.maxWaitMinutes,
    _currentArea: session.currentArea,
  };
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
