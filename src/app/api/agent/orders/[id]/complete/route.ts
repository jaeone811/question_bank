import { agentRoute } from "@/lib/http";
import { completeOrderForAgent } from "@/lib/orders";

export const dynamic = "force-dynamic";

// POST /api/agent/orders/:id/complete
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return agentRoute(req, async () => {
    const body = (await req.json().catch(() => ({}))) as { channels?: unknown; note?: unknown };
    const channels = Array.isArray(body.channels)
      ? body.channels.filter((v): v is string => typeof v === "string")
      : undefined;
    const note = typeof body.note === "string" ? body.note : undefined;
    return await completeOrderForAgent(id, { channels, note });
  });
}
