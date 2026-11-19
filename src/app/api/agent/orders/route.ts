import { agentRoute } from "@/lib/http";
import { type AgentOrderScope, listOrdersForAgent, OrderError } from "@/lib/orders";

export const dynamic = "force-dynamic";

const SCOPES: readonly AgentOrderScope[] = ["todo", "done", "all"];

// GET /api/agent/orders?scope=todo|done|all
export async function GET(req: Request) {
  return agentRoute(req, async () => {
    const raw = (new URL(req.url).searchParams.get("scope") ?? "todo").trim().toLowerCase();
    if (!SCOPES.includes(raw as AgentOrderScope)) {
      throw new OrderError("INVALID_SCOPE", "scope 는 todo, done, all 중 하나여야 합니다.", 400);
    }
    const scope = raw as AgentOrderScope;
    const orders = await listOrdersForAgent(scope);
    return { now: Date.now(), scope, orders };
  });
}
