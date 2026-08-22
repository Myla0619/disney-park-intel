/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // 这些目录在运行时用 fs 读取，默认不会被打进 Serverless 产物。
    // 漏声明不会报错，只会让功能静默降级——历史预测退回快照外推、
    // 真实评论语料退回人工示例，线上看不出任何异常。
    // src/lib/__tests__/file-tracing.test.ts 会校验声明与实际读取是否一致。
    outputFileTracingIncludes: {
      "/api/**": ["./data/wait-snapshots/**", "./data/reviews/**"],
    },
  },
};

module.exports = nextConfig;
