/**
 * 从自然语言中抽取偏好更新
 *
 * 规则法（正则 + 关键词），不额外消耗一次模型调用。覆盖的是高频、句式稳定的
 * 表达；复杂或含蓄的偏好由 Agent 在回答时自行权衡，不写入会话状态。
 * 判定规则的准确率由 src/lib/__tests__/preference-inference.test.ts 覆盖。
 */

import { updateSession } from "./session-memory";

export function inferAndUpdatePreferences(message: string, sessionId: string) {
  const waitMatch = message.match(/不.*排.*?(\d+)\s*分钟|最多.*?(\d+)\s*分钟|超过.*?(\d+)\s*分钟/);
  if (waitMatch) {
    const mins = parseInt(waitMatch[1] ?? waitMatch[2] ?? waitMatch[3], 10);
    if (!Number.isNaN(mins)) {
      updateSession(sessionId, { type: "max_wait", value: mins, timestamp: Date.now() });
    }
  }

  const groupSignals = ["怕高", "恐高", "女朋友", "女友", "老人", "爸妈", "父母", "宝宝", "婴儿", "幼儿", "怕水", "不想湿"];
  if (groupSignals.some((s) => message.includes(s))) {
    updateSession(sessionId, { type: "group_change", value: message, timestamp: Date.now() });
  }

  const areas: [string, string][] = [
    ["宝藏湾", "treasure"], ["明日世界", "tomorrow"], ["梦幻世界", "fantasy"],
    ["探险岛", "adventure"], ["玩具总动员", "toytown"], ["疯狂动物城", "zootopia"],
    ["米奇大街", "mickey"], ["奇想花园", "garden"], ["入口", "entrance"],
  ];
  const saysLocation = ["在", "现在", "刚"].some((w) => message.includes(w));
  if (saysLocation) {
    for (const [name, id] of areas) {
      if (message.includes(name)) {
        updateSession(sessionId, { type: "location", value: id, timestamp: Date.now() });
        break;
      }
    }
  }
}
