import { adminRoute } from "@/lib/http";
import { allProducts, saveProduct } from "@/lib/products";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => adminRoute(req, () => allProducts());
export const POST = (req: Request) => adminRoute(req, async () => saveProduct(null, await req.formData()));
