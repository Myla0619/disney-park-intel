/**
 * Service Worker —— 为园区内的弱网环境服务
 *
 * 园区里手机信号普遍很差，页面加载失败等于整个工具不可用。策略按资源类型区分：
 *
 *   应用外壳、静态资源  cache-first    —— 断网也能打开
 *   等待时间接口        network-first + 超时回退缓存，并标记数据陈旧程度
 *   行程接口            network-first，成功后缓存，断网时回放上一次结果
 *   Agent 对话          不缓存         —— 流式响应且必须实时
 *
 * 关键点：排队数据宁可给出"3 分钟前"的旧值并明确标注，也不要转圈到超时。
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL_ASSETS = ["/", "/dashboard", "/onboarding", "/icon-192.png", "/icon-512.png"];

// 弱网下等待多久就放弃走网络、改用缓存
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // 单个资源失败不应让整个安装失败（例如某个路由暂时 500）
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** 带超时的网络请求：弱网下卡住比失败更糟，超时即回退缓存。 */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network timeout")), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (res.ok) {
      // 记下缓存时刻，前端据此显示"数据更新于 X 分钟前"
      const body = await res.clone().text();
      const stamped = new Response(body, {
        status: res.status,
        headers: new Headers({
          ...Object.fromEntries(res.headers.entries()),
          "X-Cached-At": String(Date.now()),
        }),
      });
      cache.put(request, stamped.clone());
      return res;
    }
    throw new Error(`bad status ${res.status}`);
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Served-From-Cache", "1");
      return new Response(await cached.text(), { status: 200, headers });
    }
    return new Response(
      JSON.stringify({ error: "当前离线，且没有可用的缓存数据", offline: true }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok && request.method === "GET") {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // 导航请求离线时回放已缓存的面板页，而不是浏览器的恐龙页面
    if (request.mode === "navigate") {
      const shell = await caches.match("/dashboard");
      if (shell) return shell;
    }
    throw new Error("offline and not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Agent 是流式响应，缓存会破坏 SSE
  if (url.pathname.startsWith("/api/agent")) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request));
});
