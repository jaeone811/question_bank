import { NextResponse } from "next/server";
import { OrderError, requestReissue } from "@/lib/orders";
import { clientIp, fail, rateLimited } from "@/lib/http";

export async function POST(req: Request) {
  if (rateLimited(`reissue:${clientIp(req)}`, 6, 10 * 60 * 1000)) return fail(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  const body = (await req.json().catch(() => ({}))) as { orderNumber?: string; contact?: string };
  if (!body.orderNumber || !body.contact) return fail(422, "주문번호와 연락처를 모두 입력해 주세요.");
  try {
    return NextResponse.json({ ok: true, data: requestReissue(body.orderNumber, body.contact) });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.status, e.message, { code: e.code });
    console.error(e);
    return fail(500, "요청을 처리하지 못했습니다.");
  }
}
