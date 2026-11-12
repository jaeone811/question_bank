import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { config, paths } from "@/lib/config";
import { formatKst, productLabel } from "@/lib/format";
import { clientIp, rateLimited } from "@/lib/http";
import { watermarkPdf } from "@/lib/pdf";
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

  const check = consumeDownloadToken((await params).token, ip);
  if (!check.ok) return expired(check.reason);

  const db = getDb();
  const order = db.select().from(schema.orders).where(eq(schema.orders.id, check.token.orderId)).get();
  const product = db.select().from(schema.products).where(eq(schema.products.id, check.token.productId)).get();
  try {
    if (!order || !product?.originalFilePath) throw new Error("파일 정보 없음");
    const stored = path.basename(product.originalFilePath);
    const ext = path.extname(stored).toLowerCase();
    let bytes: Uint8Array = await readFile(path.join(paths.privateFiles(), stored));
    if (ext === ".pdf") {
      bytes = await watermarkPdf(bytes, {
        buyerName: order.buyerName,
        contact: order.buyerInstagram ? `@${order.buyerInstagram}` : (order.buyerEmail ?? ""),
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
    refundDownload(check.token.id); // 파일을 못 드렸으면 횟수는 되돌림
    return new NextResponse("파일을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.", { status: 500 });
  }
}
