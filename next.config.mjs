/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite 是 Node 內建模組，僅 server 端可用；App Router route handlers 預設 nodejs runtime。
  serverExternalPackages: ['node:sqlite'],
};

export default nextConfig;
