import { NextResponse } from "next/server";
import { checkPassword, setAdminCookie } from "@/lib/auth";
import { config } from "@/lib/config";
import { clientIp, fail, rateLimited } from "@/lib/http";

export async function POST(req: Request) {
  if (rateLimited(`login:${clientIp(req)}`, 8, 10 * 60 * 1000)) return fail(429, "시도가 너무 많습니다. 10분 뒤 다시 시도해 주세요.");
  if (!config.adminPassword) return fail(503, "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) return fail(401, "비밀번호가 올바르지 않습니다.");
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
