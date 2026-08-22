/**
 * Anthropic 客户端单例
 *
 * 此前每个路由模块顶层各写一次 `new Anthropic()`：模块被导入时就构造，
 * 缺 key 的部署要到第一次请求才炸，且错误信息不指向根因。这里改为懒构造并显式校验，
 * 让"没配 key"变成一条能直接照做的报错。
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export class MissingApiKeyError extends Error {
  constructor() {
    super("缺少 ANTHROPIC_API_KEY：复制 .env.local.example 为 .env.local 并填入 https://console.anthropic.com 获取的 key");
    this.name = "MissingApiKeyError";
  }
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (!isAnthropicConfigured()) throw new MissingApiKeyError();
  if (!client) client = new Anthropic();
  return client;
}
