import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // koffi 是原生 Node 模块(内含 .node 二进制),不能打包进 JS chunk,
  // 必须交给 Node 运行时直接 require。
  serverExternalPackages: ["koffi"],
};

export default nextConfig;
