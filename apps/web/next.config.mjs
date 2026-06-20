import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

// Determine which env file to load (mirrors apps/api/app/config.py logic)
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

// Parse the chosen env file and inject NEXT_PUBLIC_* vars into the build
function loadEnvFile(filePath) {
  const env = {};
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    }
  } catch {}
  return env;
}

const rootEnv = loadEnvFile(path.join(repoRoot, chosenEnv));

// Only expose NEXT_PUBLIC_* vars — never leak secrets to the browser
const publicEnv = Object.fromEntries(
  Object.entries(rootEnv).filter(([k]) => k.startsWith("NEXT_PUBLIC_"))
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@signalai/types", "@signalai/ui", "@signalai/utils"],
  allowedDevOrigins: ["*.local", "*.localhost", "192.168.*.*"],
  env: publicEnv,
};
export default nextConfig;

