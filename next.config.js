/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // 历史快照在运行时用 fs 读取，默认不会被打进 Serverless 产物，
    // 不显式声明的话线上预测会静默退回到快照外推。
    outputFileTracingIncludes: {
      "/api/**": ["./data/wait-snapshots/**"],
    },
  },
};

module.exports = nextConfig;
