/**
 * 会话存储后端
 *
 * 默认是进程内 Map。在 Serverless 上这意味着每个实例各存一份、冷启动即丢失——
 * 用户上一轮说过"我怕高"，下一轮打到另一个实例就忘了。也就是说多轮记忆这个功能
 * 在生产环境实际上是不生效的。
 *
 * 配置 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 后自动切到 Redis，
 * 记忆才真正跨实例、跨冷启动存活。用 Upstash 的 REST 接口而非 TCP 客户端，
 * 是因为 Serverless 环境下连接池没有意义，且不必引入额外依赖。
 */

export interface SessionStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  readonly kind: "memory" | "redis";
}

class MemoryStore implements SessionStore {
  readonly kind = "memory" as const;
  private map = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  clear() {
    this.map.clear();
  }
}

class UpstashStore implements SessionStore {
  readonly kind = "redis" as const;
  constructor(private url: string, private token: string) {}

  private async command(args: (string | number)[]): Promise<any> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash 返回 ${res.status}`);
    return (await res.json()).result;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.command(["GET", key]);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      // Redis 不可用时降级为"没有记忆"，而不是让整个对话失败
      console.error("[session-store] Redis 读取失败，本轮按无记忆处理:", err);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.command(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
    } catch (err) {
      console.error("[session-store] Redis 写入失败，本轮记忆未持久化:", err);
    }
  }
}

let store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (store) return store;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  store = url && token ? new UpstashStore(url, token) : new MemoryStore();
  return store;
}

/** 仅供测试使用。 */
export function __resetSessionStore() {
  if (store instanceof MemoryStore) store.clear();
  store = null;
}
