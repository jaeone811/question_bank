import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "./auth";
import { config } from "./config";
import { OrderError } from "./orders";

export const fail = (status: number, error: string, extra: object = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

// 간단한 메모리 기반 요청 제한 (단일 서버 기준)
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

// 다른 사이트에서 보낸 요청 차단 (관리자 쿠키 보호)
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

function safeTokenEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function runJsonHandler(fn: () => Promise<unknown> | unknown) {
  try {
    return NextResponse.json({ ok: true, data: (await fn()) ?? null });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.status, e.message, { code: e.code });
    console.error(e);
    const detail = e instanceof Error ? e.message : "알 수 없는 오류";
    return fail(500, `처리 중 오류가 발생했습니다: ${detail}`);
  }
}

export async function adminRoute(req: Request, fn: () => Promise<unknown> | unknown) {
  if (!(await isAdmin())) return fail(401, "관리자 로그인이 필요합니다.");
  if (req.method !== "GET" && !sameOrigin(req)) return fail(403, "허용되지 않은 요청입니다.");
  return runJsonHandler(fn);
}

export async function agentRoute(req: Request, fn: () => Promise<unknown> | unknown) {
  const expected = config.agentApiToken;
  if (!expected) return fail(503, "AGENT_API_TOKEN 환경변수가 설정되지 않았습니다.");
  const authHeader = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const token = match?.[1]?.trim() ?? "";
  if (!token || !safeTokenEqual(token, expected)) {
    return fail(401, "인증 토큰이 올바르지 않습니다.");
  }
  return runJsonHandler(fn);
}
