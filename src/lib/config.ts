import { createHash } from "node:crypto";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  get siteUrl() {
    const explicit = env("SITE_URL") || env("NEXT_PUBLIC_SITE_URL");
    if (explicit) return explicit.replace(/\/+$/, "");
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  },
  get supabase() {
    return {
      url: env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL"),
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    };
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
  get pickle() {
    return {
      webhookUrl: env("PICKLE_WEBHOOK_URL"),
      apiKey: env("PICKLE_API_KEY"),
    };
  },
  get maxDownloads() {
    return Math.max(1, Number(env("MAX_DOWNLOADS", "3")) || 3);
  },
};

export const LINK_TTL_MS = 5 * 60 * 60 * 1000; // 승인 시각 + 5시간 (18,000초)

// 서명용 비밀키: APP_SECRET이 없으면 SUPABASE_SERVICE_ROLE_KEY + ADMIN_PASSWORD 조합에서 결정론적으로 파생 (서버리스 호환)
let cached: string | undefined;
export function appSecret(): string {
  if (cached) return cached;
  const fromEnv = env("APP_SECRET");
  if (fromEnv.length >= 32) return (cached = fromEnv);
  const seed = `${config.supabase.serviceRoleKey}:${config.adminPassword}:question-bank-v2`;
  return (cached = createHash("sha256").update(seed).digest("base64url"));
}
