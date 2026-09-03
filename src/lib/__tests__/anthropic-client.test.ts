import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isAnthropicConfigured, credentialSource, hasEmptyApiKeyShadow, __resetAnthropicClient,
} from "../anthropic-client";

const VARS = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "ANTHROPIC_CONFIG_DIR",
  "ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID",
  "ANTHROPIC_SERVICE_ACCOUNT_ID", "ANTHROPIC_IDENTITY_TOKEN", "ANTHROPIC_IDENTITY_TOKEN_FILE",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  __resetAnthropicClient();
  for (const v of VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  // 指向一个不存在的目录，确保测试不受本机 ant auth login 状态影响
  process.env.ANTHROPIC_CONFIG_DIR = "/nonexistent-anthropic-config-for-tests";
});

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v]!;
  }
});

describe("凭证探测", () => {
  it("什么都没有时判为未配置", () => {
    expect(isAnthropicConfigured()).toBe(false);
    expect(credentialSource()).toBe("none");
  });

  it("识别 API key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
    expect(isAnthropicConfigured()).toBe(true);
    expect(credentialSource()).toBe("api-key");
  });

  it("识别 auth token", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "token";
    expect(isAnthropicConfigured()).toBe(true);
    expect(credentialSource()).toBe("auth-token");
  });

  it("识别 OAuth 配置档（ant auth login 的场景，没有任何 key 环境变量）", () => {
    // 回归测试：早先只查 ANTHROPIC_API_KEY，用 ant auth login 认证的部署会被
    // 误判为未配置而返回 503，尽管凭证完全可用
    process.env.ANTHROPIC_PROFILE = "default";
    expect(isAnthropicConfigured()).toBe(true);
    expect(credentialSource()).toBe("oauth-profile");
  });

  it("识别 Workload Identity Federation", () => {
    process.env.ANTHROPIC_FEDERATION_RULE_ID = "rule";
    process.env.ANTHROPIC_ORGANIZATION_ID = "org";
    process.env.ANTHROPIC_SERVICE_ACCOUNT_ID = "sa";
    process.env.ANTHROPIC_IDENTITY_TOKEN_FILE = "/tmp/token";
    expect(isAnthropicConfigured()).toBe(true);
    expect(credentialSource()).toBe("workload-identity-federation");
  });

  it("WIF 变量不全时不激活", () => {
    process.env.ANTHROPIC_FEDERATION_RULE_ID = "rule";
    process.env.ANTHROPIC_ORGANIZATION_ID = "org";
    // 缺 service account 与 identity token
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("WIF 缺 identity token 时不激活", () => {
    process.env.ANTHROPIC_FEDERATION_RULE_ID = "rule";
    process.env.ANTHROPIC_ORGANIZATION_ID = "org";
    process.env.ANTHROPIC_SERVICE_ACCOUNT_ID = "sa";
    expect(isAnthropicConfigured()).toBe(false);
  });
});

describe("空 API key 的屏蔽陷阱", () => {
  it("空字符串被识别出来，而不是当作已配置", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(hasEmptyApiKeyShadow()).toBe(true);
    expect(isAnthropicConfigured()).toBe(false);
    expect(credentialSource()).toBe("empty-api-key-shadow");
  });

  it("空 key 会屏蔽本可用的 OAuth 配置档——这正是它危险的地方", () => {
    process.env.ANTHROPIC_PROFILE = "default";
    process.env.ANTHROPIC_API_KEY = "";
    expect(isAnthropicConfigured()).toBe(false);
  });
});
