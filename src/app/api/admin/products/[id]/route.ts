import { adminRoute } from "@/lib/http";
import { deleteProduct, saveProduct } from "@/lib/products";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return adminRoute(req, async () => saveProduct(id, await req.formData()));
};
export const DELETE = async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return adminRoute(req, () => deleteProduct(id));
};
