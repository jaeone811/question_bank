import QRCode from "qrcode";
import { Storefront, type StoreProduct } from "@/components/Storefront";
import { config } from "@/lib/config";
import { sellableProducts } from "@/lib/orders";

export const dynamic = "force-dynamic";

const qr = async (link: string) =>
  link ? `data:image/svg+xml;utf8,${encodeURIComponent(await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#141413", light: "#ffffff" } }))}` : null;

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
        kakaoPayLink: config.kakaoPayLink,
        tossLink: config.tossLink,
        kakaoQr: await qr(config.kakaoPayLink),
        tossQr: await qr(config.tossLink),
        maxDownloads: config.maxDownloads,
      }}
    />
  );
}
