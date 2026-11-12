import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { dataDir } from "../db";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  get siteUrl() {
    return env("SITE_URL", "http://localhost:3000").replace(/\/+$/, "");
  },
  get adminPassword() {
    return env("ADMIN_PASSWORD");
  },
  get bank() {
    return { name: env("BANK_NAME"), account: env("BANK_ACCOUNT"), holder: env("BANK_HOLDER") };
  },
  get kakaoPayLink() {
    return env("KAKAOPAY_LINK");
  },
  get tossLink() {
    return env("TOSS_LINK");
  },
  get sellerInstagram() {
    return env("SELLER_INSTAGRAM").replace(/^@/, "");
  },
  get gmail() {
    return { user: env("GMAIL_USER"), appPassword: env("GMAIL_APP_PASSWORD").replace(/\s+/g, "") };
  },
  get telegram() {
    return { token: env("TELEGRAM_BOT_TOKEN"), chatId: env("TELEGRAM_CHAT_ID") };
  },
  get discordWebhook() {
    return env("DISCORD_WEBHOOK_URL");
  },
  get maxDownloads() {
    return Math.max(1, Number(env("MAX_DOWNLOADS", "3")) || 3);
  },
};

export const LINK_TTL_MS = 5 * 60 * 60 * 1000; // 승인 시각 + 5시간 (18,000초)

// 서명용 비밀키: 환경변수가 없으면 data/.secret 에 한 번 만들어 두고 계속 씀
let cached: string | undefined;
export function appSecret(): string {
  if (cached) return cached;
  const fromEnv = env("APP_SECRET");
  if (fromEnv.length >= 32) return (cached = fromEnv);
  const file = path.join(dataDir(), ".secret");
  if (existsSync(file)) return (cached = readFileSync(file, "utf8").trim());
  mkdirSync(dataDir(), { recursive: true });
  const s = randomBytes(48).toString("base64url");
  writeFileSync(file, s, { mode: 0o600 });
  return (cached = s);
}

export const paths = {
  privateFiles: () => path.join(process.cwd(), "storage", "private", "questions"),
  samples: () => path.join(process.cwd(), "storage", "samples"),
  vault: () => path.join(process.cwd(), ".agent-vault"),
  screenshots: () => path.join(process.cwd(), ".agent-vault", "screenshots"),
};
