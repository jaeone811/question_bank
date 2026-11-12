import { NextResponse } from "next/server";
import { createOrder, OrderError } from "@/lib/orders";
import { clientIp, fail, rateLimited } from "@/lib/http";
import { validateOrder } from "@/lib/validation";

export async function POST(req: Request) {
  if (rateLimited(`order:${clientIp(req)}`, 8, 10 * 60 * 1000)) return fail(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail(400, "요청 형식이 올바르지 않습니다.");
  const v = validateOrder(body as Record<string, unknown>);
  if (!v.ok) return fail(422, "입력 내용을 확인해 주세요.", { errors: v.errors });
  try {
    const { order } = await createOrder(v.data);
    return NextResponse.json({ ok: true, data: { orderNumber: order.orderNumber, amount: order.totalAmount } }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.status, e.message, { code: e.code });
    console.error(e);
    return fail(500, "주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
