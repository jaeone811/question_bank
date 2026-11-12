import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProductManager } from "@/components/admin/ProductManager";
import { isAdmin } from "@/lib/auth";
import { allProductsWithStatus } from "@/lib/products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "패키지 관리", robots: { index: false } };

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  const { products, dbError } = await allProductsWithStatus();
  return (
    <section className="section section--page section--wide">
      <div className="wrap">
        <ProductManager initial={products} dbError={dbError} />
      </div>
    </section>
  );
}
