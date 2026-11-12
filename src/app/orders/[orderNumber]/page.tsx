import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatus } from "@/components/OrderStatus";
import { publicOrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "주문 진행 상황", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ orderNumber: string }> }) {
  const data = publicOrderStatus((await params).orderNumber);
  if (!data) notFound();
  return (
    <section className="section section--page">
      <div className="wrap wrap--narrow">
        <OrderStatus initial={data} />
      </div>
    </section>
  );
}
