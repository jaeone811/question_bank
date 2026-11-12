import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { paths } from "./config";
import { countPages, makeSamplePdf } from "./pdf";
import { OrderError } from "./orders";

const { products, orders } = schema;
const ALLOWED_EXT = [".pdf", ".hwp", ".hwpx", ".zip"];
export const MAX_UPLOAD = 100 * 1024 * 1024;

export type ProductFields = {
  title: string;
  subject: string | null;
  difficulty: string | null;
  questionCount: number | null;
  price: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function parseProductFields(form: FormData): ProductFields {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const title = s("title");
  const price = Number(s("price"));
  if (title.length < 1 || title.length > 60) throw new OrderError("BAD_INPUT", "패키지 이름을 60자 이내로 입력해 주세요.");
  if (!Number.isInteger(price) || price <= 0) throw new OrderError("BAD_INPUT", "가격을 1원 이상 정수로 입력해 주세요.");
  const qc = s("questionCount");
  if (qc && (!Number.isInteger(Number(qc)) || Number(qc) < 0)) throw new OrderError("BAD_INPUT", "문항 수를 확인해 주세요.");
  return {
    title,
    subject: s("subject") || null,
    difficulty: s("difficulty") || null,
    questionCount: qc ? Number(qc) : null,
    price,
    description: s("description") || null,
    sortOrder: Number(s("sortOrder")) || 0,
    isActive: s("isActive") !== "false",
  };
}

const remove = (dir: string, name: string | null) => name && rmSync(path.join(dir, path.basename(name)), { force: true });

// 원본 저장 + (PDF 면) 쪽수 계산과 샘플 자동 생성
async function storeOriginal(id: string, file: File) {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new OrderError("BAD_FILE", "PDF, HWP, ZIP 파일만 올릴 수 있습니다.");
  if (file.size > MAX_UPLOAD) throw new OrderError("BAD_FILE", "파일은 100MB 이하여야 합니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  mkdirSync(paths.privateFiles(), { recursive: true });
  const stored = `${id}-${stamp}${ext}`;
  writeFileSync(path.join(paths.privateFiles(), stored), bytes);
  let pageCount: number | null = null;
  let autoSample: string | null = null;
  if (ext === ".pdf") {
    try {
      pageCount = await countPages(bytes);
      autoSample = saveSample(id, await makeSamplePdf(bytes));
    } catch {
      rmSync(path.join(paths.privateFiles(), stored), { force: true });
      throw new OrderError("BAD_FILE", "PDF 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.");
    }
  }
  return { stored, originalFileName: file.name, pageCount, autoSample };
}

function saveSample(id: string, bytes: Uint8Array) {
  mkdirSync(paths.samples(), { recursive: true });
  const name = `${id}-sample-${Date.now()}.pdf`;
  writeFileSync(path.join(paths.samples(), name), bytes);
  return name;
}

const isFile = (v: FormDataEntryValue | null): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && v.size > 0;

export async function saveProduct(id: string | null, form: FormData) {
  const db = getDb();
  const fields = parseProductFields(form);
  const now = Date.now();
  const existing = id ? db.select().from(products).where(eq(products.id, id)).get() : undefined;
  if (id && !existing) throw new OrderError("NOT_FOUND", "패키지를 찾을 수 없습니다.", 404);
  const pid = existing?.id ?? `p-${randomBytes(5).toString("hex")}`;

  const patch: Partial<typeof products.$inferInsert> = { ...fields, updatedAt: now };
  const full = form.get("fullFile");
  const sample = form.get("sampleFile");
  const oldFiles: [string, string | null][] = [];

  if (isFile(full)) {
    const r = await storeOriginal(pid, full);
    patch.originalFilePath = r.stored;
    patch.originalFileName = r.originalFileName;
    patch.pageCount = r.pageCount;
    oldFiles.push([paths.privateFiles(), existing?.originalFilePath ?? null]);
    if (r.autoSample && !isFile(sample)) {
      patch.samplePdfUrl = r.autoSample;
      oldFiles.push([paths.samples(), existing?.samplePdfUrl ?? null]);
    }
  }
  if (isFile(sample)) {
    if (path.extname(sample.name).toLowerCase() !== ".pdf") throw new OrderError("BAD_FILE", "샘플은 PDF 파일만 올릴 수 있습니다.");
    patch.samplePdfUrl = saveSample(pid, new Uint8Array(await sample.arrayBuffer()));
    oldFiles.push([paths.samples(), existing?.samplePdfUrl ?? null]);
  }

  if (existing) db.update(products).set(patch).where(eq(products.id, pid)).run();
  else db.insert(products).values({ ...fields, ...patch, id: pid, createdAt: now, updatedAt: now }).run();
  for (const [dir, name] of oldFiles) remove(dir, name);
  return db.select().from(products).where(eq(products.id, pid)).get()!;
}

export function deleteProduct(id: string) {
  const db = getDb();
  const p = db.select().from(products).where(eq(products.id, id)).get();
  if (!p) throw new OrderError("NOT_FOUND", "패키지를 찾을 수 없습니다.", 404);
  if (db.select({ id: orders.id }).from(orders).where(eq(orders.productId, id)).get())
    throw new OrderError("HAS_ORDERS", "주문 내역이 있는 패키지는 삭제할 수 없습니다. 판매 중지로 바꿔 주세요.", 409);
  db.delete(products).where(eq(products.id, id)).run();
  remove(paths.privateFiles(), p.originalFilePath);
  remove(paths.samples(), p.samplePdfUrl);
}

export const allProducts = () => getDb().select().from(products).orderBy(products.sortOrder, products.createdAt).all();
