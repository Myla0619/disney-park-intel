/**
 * Anthropic 客户端与凭证探测
 *
 * SDK 的凭证解析顺序（先命中者胜）：
 *   ANTHROPIC_API_KEY → ANTHROPIC_AUTH_TOKEN → ant auth login 的 OAuth 配置档
 *   → Workload Identity Federation 环境变量 → 磁盘上的默认配置档
 *
 * 因此「没有 ANTHROPIC_API_KEY」不等于「没有凭证」。早先这里只判断该环境变量，
 * 用 `ant auth login` 或 WIF 认证的部署会被误判为未配置而返回 503。
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

let client: Anthropic | null = null;

export class MissingCredentialsError extends Error {
  constructor() {
    super(
      "未找到 Anthropic 凭证。三选一：\n" +
        "  1. ant auth login（本机开发推荐，无需长期密钥）\n" +
        "  2. 在 .env.local 中设置 ANTHROPIC_API_KEY\n" +
        "  3. 配置 Workload Identity Federation（CI/服务器场景）"
    );
    this.name = "MissingCredentialsError";
  }
}

/** WIF 需要这四个变量同时存在，缺一个都不会激活。 */
function hasFederationCredentials(): boolean {
  const required = [
    "ANTHROPIC_FEDERATION_RULE_ID",
    "ANTHROPIC_ORGANIZATION_ID",
    "ANTHROPIC_SERVICE_ACCOUNT_ID",
  ];
  const hasIdentityToken =
    process.env.ANTHROPIC_IDENTITY_TOKEN_FILE || process.env.ANTHROPIC_IDENTITY_TOKEN;
  return required.every((v) => Boolean(process.env[v])) && Boolean(hasIdentityToken);
}

/** `ant auth login` 会在配置目录下写入 credentials/<profile>.json。 */
function hasOAuthProfile(): boolean {
  const configDir =
    process.env.ANTHROPIC_CONFIG_DIR ??
    (process.platform === "win32"
      ? path.join(process.env.APPDATA ?? "", "Anthropic")
      : path.join(os.homedir(), ".config", "anthropic"));

  const credentialsDir = path.join(configDir, "credentials");
  try {
    return existsSync(credentialsDir) && readdirSync(credentialsDir).some((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
}

/**
 * 空字符串的 ANTHROPIC_API_KEY 是个陷阱：它仍会占据优先级最高的位置并以空密钥
 * 发起认证，把本来可用的配置档整个屏蔽掉。这里单独识别出来，给出可直接照做的提示。
 */
export function hasEmptyApiKeyShadow(): boolean {
  return process.env.ANTHROPIC_API_KEY === "";
}

export function isAnthropicConfigured(): boolean {
  if (hasEmptyApiKeyShadow()) return false;
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      // 显式指定了配置档即视为已配置：指向不存在的配置档在 SDK 侧是明确报错，
      // 不会静默回退，所以这里不必再去磁盘上确认
      process.env.ANTHROPIC_PROFILE ||
      hasFederationCredentials() ||
      hasOAuthProfile()
  );
}

/** 当前生效的凭证来源，用于日志与诊断。 */
export function credentialSource(): string {
  if (hasEmptyApiKeyShadow()) return "empty-api-key-shadow";
  if (process.env.ANTHROPIC_API_KEY) return "api-key";
  if (process.env.ANTHROPIC_AUTH_TOKEN) return "auth-token";
  if (process.env.ANTHROPIC_PROFILE || hasOAuthProfile()) return "oauth-profile";
  if (hasFederationCredentials()) return "workload-identity-federation";
  return "none";
}

export function getAnthropicClient(): Anthropic {
  if (!isAnthropicConfigured()) throw new MissingCredentialsError();
  // 零参构造：由 SDK 自行按上述顺序解析凭证，不在这里硬塞 apiKey
  if (!client) client = new Anthropic();
  return client;
}

/** 仅供测试使用。 */
export function __resetAnthropicClient() {
  client = null;
}
