/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev、正式服務與 release verification 各用獨立 artifacts，避免任何一方
  // 改寫另一個程序仍在讀取的 chunks。
  distDir: process.env.NEXT_DIST_DIR
    || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  // node:sqlite 是 Node 內建模組，僅 server 端可用；App Router route handlers 預設 nodejs runtime。
  serverExternalPackages: ['node:sqlite'],
};

export default nextConfig;
