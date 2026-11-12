import { NextResponse } from "next/server";
import { publicOrderStatus } from "@/lib/orders";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const data = await publicOrderStatus((await params).orderNumber);
  if (!data) return fail(404, "주문을 찾을 수 없습니다.");
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}
