// 개발·검증용: 예시 PDF 를 만들어 패키지에 올림 (실제 판매 자료가 아님을 본문에 표시)
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDb, schema } from "../src/db";
import { saveProduct } from "../src/lib/products";

async function demoPdf(title: string, pages: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let p = 1; p <= pages; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${title}`, { x: 48, y: 780, size: 18, font: bold });
    page.drawText(`DEMO FILE (not a real product) - page ${p} / ${pages}`, { x: 48, y: 758, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawLine({ start: { x: 48, y: 746 }, end: { x: 547, y: 746 }, thickness: 1 });
    for (let q = 0; q < 5; q++) {
      const y = 706 - q * 132;
      page.drawText(`${(p - 1) * 5 + q + 1}.`, { x: 48, y, size: 12, font: bold });
      for (let l = 0; l < 4; l++) page.drawRectangle({ x: 72, y: y - l * 18 - 2, width: 420 - l * 46, height: 7, color: rgb(0.86, 0.86, 0.84) });
      for (let c = 0; c < 5; c++) page.drawText(`(${c + 1})`, { x: 72 + c * 90, y: y - 92, size: 10, font });
    }
  }
  return doc.save();
}

async function main() {
  await import("./seed");
  const db = getDb();
  const demo = [
    { id: "h2-eng", file: "English I mock exam variants", pages: 12, difficulty: "표준", questionCount: "60" },
    { id: "h2-kor", file: "Korean literature", pages: 9, difficulty: "표준", questionCount: "45" },
    { id: "h2-math", file: "Math I exp and log", pages: 8, difficulty: "심화", questionCount: "40" },
  ];
  for (const d of demo) {
    const p = db.select().from(schema.products).all().find((x) => x.id === d.id)!;
    const fd = new FormData();
    fd.set("title", p.title);
    fd.set("subject", p.subject ?? "");
    fd.set("difficulty", d.difficulty);
    fd.set("questionCount", d.questionCount);
    fd.set("price", String(p.price));
    fd.set("description", p.description ?? "");
    fd.set("sortOrder", String(p.sortOrder));
    fd.set("fullFile", new File([Buffer.from(await demoPdf(d.file, d.pages))], `${d.id}.pdf`, { type: "application/pdf" }));
    const saved = await saveProduct(d.id, fd);
    console.log(saved.id, saved.pageCount, "쪽", saved.samplePdfUrl);
  }
}
void main();
