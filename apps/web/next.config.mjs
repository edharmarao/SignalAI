/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@signalai/types", "@signalai/ui", "@signalai/utils"],
  allowedDevOrigins: ["*.local", "*.localhost", "192.168.*.*"],
};
export default nextConfig;
