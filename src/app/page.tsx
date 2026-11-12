import { Storefront, type StoreProduct } from "@/components/Storefront";
import { config } from "@/lib/config";
import { sellableProducts } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function Home() {
  const list = await sellableProducts();
  const products: StoreProduct[] = list.map((p) => ({
    id: p.id,
    title: p.title,
    subject: p.subject,
    grade: p.grade,
    difficulty: p.difficulty,
    questionCount: p.questionCount,
    pageCount: p.pageCount,
    price: p.price,
    description: p.description,
    sampleUrl: p.samplePdfUrl ? `/api/samples/${p.samplePdfUrl}` : null,
  }));
  return (
    <Storefront
      products={products}
      pay={{
        bank: config.bank,
        maxDownloads: config.maxDownloads,
      }}
    />
  );
}
