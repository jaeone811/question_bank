import { adminRoute } from "@/lib/http";
import { approveOrder, markDeliveredManually, OrderError, reissueOrder, rejectOrder } from "@/lib/orders";

// POST /api/admin/orders/{id}/approve | reject | reissue | mark-delivered
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  return adminRoute(req, async () => {
    const body = (await req.json().catch(() => ({}))) as { memo?: string };
    switch (action) {
      case "approve": {
        const r = approveOrder(id);
        return { orderNumber: r.orderNumber, expiresAt: r.expiresAt };
      }
      case "reissue": {
        const r = reissueOrder(id);
        return { orderNumber: r.orderNumber, expiresAt: r.expiresAt };
      }
      case "reject":
        return rejectOrder(id, body.memo);
      case "mark-delivered":
        return markDeliveredManually(id);
      default:
        throw new OrderError("NOT_FOUND", "알 수 없는 요청입니다.", 404);
    }
  });
}
