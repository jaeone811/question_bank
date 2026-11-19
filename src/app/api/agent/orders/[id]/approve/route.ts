import { agentRoute } from "@/lib/http";
import { approveOrReissueForAgent } from "@/lib/orders";

export const dynamic = "force-dynamic";

// POST /api/agent/orders/:id/approve
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return agentRoute(req, async () => {
    const body = (await req.json().catch(() => ({}))) as { reissue?: boolean };
    return await approveOrReissueForAgent(id, { reissue: Boolean(body.reissue) });
  });
}
