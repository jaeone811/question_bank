import { PDFDocument, degrees, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";

let fontBytes: Buffer | undefined;
function koreanFont() {
  // 한글 워터마크용 (pdf-lib 기본 폰트는 한글을 못 씀)
  fontBytes ??= readFileSync(path.join(process.cwd(), "node_modules/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf"));
  return fontBytes;
}

async function embed(doc: PDFDocument): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  // subset: true 는 pdf-lib 에서 한글 글리프가 빠지는 문제가 있어 전체 폰트를 넣음
  return doc.embedFont(koreanFont(), { subset: false });
}

function stamp(doc: PDFDocument, font: PDFFont, diagonal: string, footer: string, opacity: number) {
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(11, Math.min(width, height) / 34);
    const textWidth = font.widthOfTextAtSize(diagonal, size);
    const stepY = height / 3;
    // 대각선으로 세 줄 반복
    for (let i = 0; i < 3; i++) {
      page.drawText(diagonal, {
        x: Math.max(12, (width - textWidth * 0.82) / 2),
        y: stepY * i + stepY * 0.25,
        size,
        font,
        color: rgb(0.08, 0.08, 0.08),
        opacity,
        rotate: degrees(32),
      });
    }
    page.drawText(footer, { x: 18, y: 10, size: 7, font, color: rgb(0.2, 0.2, 0.2), opacity: 0.55 });
  }
}

export type WatermarkInfo = { buyerName: string; contact: string; orderNumber: string; downloadedAt: string };

// 다운로드 직전에 구매자 정보를 모든 페이지에 찍음
export async function watermarkPdf(original: Uint8Array, info: WatermarkInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await embed(doc);
  const line = `${info.buyerName} · ${info.contact} · ${info.orderNumber}`;
  stamp(doc, font, line, `${line} · ${info.downloadedAt} 다운로드 · 개인 학습용, 무단 공유 및 재판매 금지`, 0.1);
  doc.setSubject(`구매자 ${info.buyerName} / 주문 ${info.orderNumber}`);
  return doc.save();
}

// 원본 앞 2쪽만 떼어 '샘플' 워터마크를 찍은 미리보기 PDF 생성
export async function makeSamplePdf(original: Uint8Array, pages = 2): Promise<Uint8Array> {
  const src = await PDFDocument.load(original, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const n = Math.min(pages, src.getPageCount());
  for (const p of await out.copyPages(src, Array.from({ length: n }, (_, i) => i))) out.addPage(p);
  const font = await embed(out);
  stamp(out, font, "미리보기 샘플 · 기말고사 문제은행", "미리보기용 샘플입니다. 전체 자료는 구매 후 받으실 수 있습니다.", 0.14);
  return out.save();
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
}
