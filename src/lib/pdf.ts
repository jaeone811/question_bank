import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config";

let fontBytes: Uint8Array | undefined;

async function koreanFont(): Promise<Uint8Array | null> {
  if (fontBytes) return fontBytes;
  const candidates = [
    path.join(process.cwd(), "public/vendor/Pretendard-SemiBold.ttf"),
    path.join(process.cwd(), "node_modules/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      fontBytes = new Uint8Array(readFileSync(p));
      return fontBytes;
    }
  }
  // Vercel 서버리스 환경에서 로컬 파일이 번들에서 제외된 경우 정적 에셋 URL에서 가져옴
  try {
    const res = await fetch(`${config.siteUrl}/vendor/Pretendard-SemiBold.ttf`);
    if (res.ok) {
      fontBytes = new Uint8Array(await res.arrayBuffer());
      return fontBytes;
    }
  } catch (e) {
    console.warn("원격 한글 폰트 로드 실패:", e);
  }
  return null;
}

async function embed(doc: PDFDocument): Promise<{ font: PDFFont; isKorean: boolean }> {
  const bytes = await koreanFont();
  if (bytes) {
    try {
      doc.registerFontkit(fontkit);
      // subset: true 는 pdf-lib 에서 한글 글리프가 빠지는 문제가 있어 전체 폰트를 넣음
      const font = await doc.embedFont(bytes, { subset: false });
      return { font, isKorean: true };
    } catch (e) {
      console.warn("한글 폰트 임베딩 실패, 기본 폰트로 대체:", e);
    }
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { font, isKorean: false };
}

function toAsciiSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim() || "QUESTION BANK";
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
  try {
    const doc = await PDFDocument.load(original, { ignoreEncryption: true });
    const { font, isKorean } = await embed(doc);
    const rawLine = `${info.buyerName} · ${info.contact} · ${info.orderNumber}`;
    const line = isKorean ? rawLine : toAsciiSafe(`${info.orderNumber} / ${info.contact}`);
    const footer = isKorean
      ? `${rawLine} · ${info.downloadedAt} 다운로드 · 개인 학습용, 무단 공유 및 재판매 금지`
      : toAsciiSafe(`${info.orderNumber} - ${info.downloadedAt} - Personal use only`);
    stamp(doc, font, line, footer, 0.1);
    doc.setSubject(`Order ${info.orderNumber}`);
    return doc.save();
  } catch (e) {
    console.warn("워터마크 적용 실패, 원본 PDF 반환:", e);
    return original;
  }
}

// 원본 앞 2쪽만 떼어 '샘플' 워터마크를 찍은 미리보기 PDF 생성
export async function makeSamplePdf(original: Uint8Array, pages = 2): Promise<Uint8Array> {
  const src = await PDFDocument.load(original, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const n = Math.min(pages, src.getPageCount());
  for (const p of await out.copyPages(src, Array.from({ length: n }, (_, i) => i))) out.addPage(p);
  const { font, isKorean } = await embed(out);
  const diag = isKorean ? "미리보기 샘플 · 기말고사 문제은행" : "SAMPLE PREVIEW - QUESTION BANK";
  const foot = isKorean
    ? "미리보기용 샘플입니다. 전체 자료는 구매 후 받으실 수 있습니다."
    : "Sample preview (first 2 pages).";
  stamp(out, font, diag, foot, 0.14);
  return out.save();
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
}
