import { NextResponse } from "next/server";
import path from "node:path";
import { mapOrder, mapProduct } from "@/db/schema";
import { config } from "@/lib/config";
import { formatKst, productLabel } from "@/lib/format";
import { clientIp, rateLimited } from "@/lib/http";
import { watermarkPdf } from "@/lib/pdf";
import { downloadPrivateFile, getSupabase } from "@/lib/supabase";
import { consumeDownloadToken, refundDownload } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/hwp+zip",
};

const expired = (reason: string) => NextResponse.redirect(`${config.siteUrl}/download/expired?reason=${reason}`, 303);

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (rateLimited(`dl:${ip}`, 30, 10 * 60 * 1000)) return new NextResponse("요청이 너무 많습니다.", { status: 429 });

  const check = await consumeDownloadToken((await params).token, ip);
  if (!check.ok) return expired(check.reason);

  const sb = getSupabase();
  const [{ data: ordRow }, { data: prodRow }] = await Promise.all([
    sb.from("orders").select("*").eq("id", check.token.orderId).maybeSingle(),
    sb.from("products").select("*").eq("id", check.token.productId).maybeSingle(),
  ]);

  try {
    if (!ordRow || !prodRow) throw new Error("주문 또는 상품 정보 없음");
    const order = mapOrder(ordRow);
    const product = mapProduct(prodRow);
    if (!product.originalFilePath) throw new Error("파일 정보 없음");

    const stored = path.basename(product.originalFilePath);
    const ext = path.extname(stored).toLowerCase();
    let bytes: Uint8Array = await downloadPrivateFile(stored);
    if (ext === ".pdf") {
      bytes = await watermarkPdf(bytes, {
        buyerName: order.buyerName,
        contact: order.buyerInstagram ? `@${order.buyerInstagram}` : (order.buyerEmail ?? order.buyerPhone),
        orderNumber: order.orderNumber,
        downloadedAt: formatKst(Date.now()),
      });
    }
    const filename = `${productLabel(product).replace(/[\\/:*?"<>|]/g, "")}${ext}`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="download${ext}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
        "X-Downloads-Left": String(check.token.maxDownloads - check.token.downloadCount),
      },
    });
  } catch (e) {
    console.error("다운로드 실패", e);
    await refundDownload(check.token.id);
    return new NextResponse("파일을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.", { status: 500 });
  }
}
