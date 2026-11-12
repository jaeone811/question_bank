import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { fail } from "@/lib/http";
import { findOrderForPickle } from "@/lib/orders";

export const dynamic = "force-dynamic";

// GET /api/pickle/order?orderNumber=... | ?instagram=... | ?phone=...
// 피클 AI 에서 구매자 주문 상태 및 5시간 다운로드 링크를 조회할 때 사용
export async function GET(req: Request) {
  const apiKey = config.pickle.apiKey;
  if (apiKey) {
    const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-pickle-key")?.trim();
    if (auth !== apiKey) return fail(401, "인증 키가 올바르지 않습니다.");
  }

  const { searchParams } = new URL(req.url);
  const orderNumber = searchParams.get("orderNumber") ?? undefined;
  const instagram = searchParams.get("instagram") ?? undefined;
  const phone = searchParams.get("phone") ?? undefined;

  if (!orderNumber && !instagram && !phone) {
    return fail(400, "orderNumber, instagram, phone 중 하나를 전달해 주세요.");
  }

  const data = await findOrderForPickle({ orderNumber, instagram, phone });
  if (!data) return fail(404, "일치하는 주문을 찾지 못했습니다.");
  return NextResponse.json({ ok: true, data });
}
