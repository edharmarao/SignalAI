/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@signalai/types", "@signalai/ui", "@signalai/utils"],
};
export default nextConfig;
