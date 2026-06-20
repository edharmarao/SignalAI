import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

// Determine which env file is active (mirrors apps/api/app/config.py logic)
const appEnv = process.env.APP_ENV?.toLowerCase();
let chosenEnv;
if (appEnv === "prod") {
  chosenEnv = ".env.prod";
} else {
  let localIp = "";
  try {
    localIp = execSync(
      "node -e \"const s=require('dgram').createSocket('udp4');s.connect(80,'8.8.8.8',()=>{process.stdout.write(s.address().address);s.close()})\"",
      { timeout: 2000, stdio: ["pipe", "pipe", "ignore"] }
    ).toString().trim();
  } catch {}
  chosenEnv = localIp === "209.182.232.165" ? ".env.prod" : ".env";
}

const cyan = "\x1b[96m";
const reset = "\x1b[0m";
console.log(`${cyan}[web] env → ${chosenEnv}  (APP_ENV: ${process.env.APP_ENV || "not set"})${reset}`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@signalai/types", "@signalai/ui", "@signalai/utils"],
  allowedDevOrigins: ["*.local", "*.localhost", "192.168.*.*"],
};
export default nextConfig;

