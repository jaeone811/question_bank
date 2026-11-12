import { adminRoute } from "@/lib/http";
import { adminOverview } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => adminRoute(req, () => adminOverview());
