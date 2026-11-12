import { adminRoute } from "@/lib/http";
import { retryTask } from "@/lib/orders";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminRoute(req, () => retryTask(id));
}
