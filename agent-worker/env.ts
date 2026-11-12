// 워커는 Next 밖에서 돌기 때문에 .env 파일을 직접 읽음 (가장 먼저 import 할 것)
import { existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const agentEnv = {
  pollMs: Math.max(1000, Number(env("AGENT_POLL_MS", "4000")) || 4000),
  headless: env("AGENT_HEADLESS", "false") === "true",
  chromePath: env("AGENT_CHROME_PATH") || undefined,
  brain: env("AGENT_BRAIN", "auto") as "auto" | "claude" | "gemini" | "template",
  instagramBase: env("INSTAGRAM_BASE_URL", "https://www.instagram.com").replace(/\/+$/, ""),
  // 인스타 DM 사이 최소 간격 (자동화 탐지·계정 제한 위험을 줄이기 위함)
  igMinIntervalMs: Math.max(0, Number(env("AGENT_IG_MIN_INTERVAL_MS", "45000")) || 0),
  authTimeoutMs: Math.max(10_000, Number(env("AGENT_AUTH_TIMEOUT_MS", "600000")) || 600_000),
};
