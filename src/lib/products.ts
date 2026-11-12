import { randomBytes } from "node:crypto";
import path from "node:path";
import { mapProduct, type Product } from "@/db/schema";
import {
  getSupabase,
  removePrivateFile,
  removeSampleFile,
  uploadPrivateFile,
  uploadSampleFile,
} from "./supabase";
import { countPages, makeSamplePdf } from "./pdf";
import { OrderError } from "./orders";

const ALLOWED_EXT = [".pdf", ".hwp", ".hwpx", ".zip"];
// Supabase 무료 티어 파일당 업로드 한도: 50MB
export const MAX_UPLOAD = 50 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/hwp+zip",
};

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

// 원본을 Supabase Storage 비공개 버킷('questions')에 저장 + (PDF면) 쪽수 계산과 샘플 자동 생성
async function storeOriginal(id: string, file: File) {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new OrderError("BAD_FILE", "PDF, HWP, ZIP 파일만 올릴 수 있습니다.");
  if (file.size > MAX_UPLOAD) throw new OrderError("BAD_FILE", "파일은 50MB 이하여야 합니다 (Supabase 무료 티어 한도).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const stored = `${id}-${stamp}${ext}`;

  let pageCount: number | null = null;
  let autoSample: string | null = null;
  if (ext === ".pdf") {
    try {
      pageCount = await countPages(bytes);
      const sampleBytes = await makeSamplePdf(bytes);
      autoSample = await saveSample(id, sampleBytes);
    } catch (e) {
      console.error("PDF 처리 오류:", e);
      throw new OrderError("BAD_FILE", "PDF 파일을 읽거나 샘플을 생성하지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.");
    }
  }

  await uploadPrivateFile(stored, bytes, MIME[ext] ?? "application/octet-stream");
  return { stored, originalFileName: file.name, pageCount, autoSample };
}

async function saveSample(id: string, bytes: Uint8Array): Promise<string> {
  const name = `${id}-sample-${Date.now()}.pdf`;
  await uploadSampleFile(name, bytes);
  return name;
}

const isFile = (v: FormDataEntryValue | null): v is File =>
  typeof v === "object" && v !== null && "arrayBuffer" in v && v.size > 0;

export async function saveProduct(id: string | null, form: FormData): Promise<Product> {
  const sb = getSupabase();
  const fields = parseProductFields(form);
  const now = Date.now();

  let existing: Product | undefined;
  if (id) {
    const { data } = await sb.from("products").select("*").eq("id", id).maybeSingle();
    if (!data) throw new OrderError("NOT_FOUND", "패키지를 찾을 수 없습니다.", 404);
    existing = mapProduct(data);
  }
  const pid = existing?.id ?? `p-${randomBytes(5).toString("hex")}`;

  const rowPatch: Record<string, unknown> = {
    title: fields.title,
    subject: fields.subject,
    difficulty: fields.difficulty,
    question_count: fields.questionCount,
    price: fields.price,
    description: fields.description,
    sort_order: fields.sortOrder,
    is_active: fields.isActive,
    updated_at: now,
  };

  const full = form.get("fullFile");
  const sample = form.get("sampleFile");
  const oldPrivate: (string | null)[] = [];
  const oldSample: (string | null)[] = [];

  if (isFile(full)) {
    const r = await storeOriginal(pid, full);
    rowPatch.original_file_path = r.stored;
    rowPatch.original_file_name = r.originalFileName;
    rowPatch.page_count = r.pageCount;
    oldPrivate.push(existing?.originalFilePath ?? null);
    if (r.autoSample && !isFile(sample)) {
      rowPatch.sample_pdf_url = r.autoSample;
      oldSample.push(existing?.samplePdfUrl ?? null);
    }
  }

  if (isFile(sample)) {
    if (path.extname(sample.name).toLowerCase() !== ".pdf") {
      throw new OrderError("BAD_FILE", "샘플은 PDF 파일만 올릴 수 있습니다.");
    }
    rowPatch.sample_pdf_url = await saveSample(pid, new Uint8Array(await sample.arrayBuffer()));
    oldSample.push(existing?.samplePdfUrl ?? null);
  }

  if (existing) {
    const { data, error } = await sb.from("products").update(rowPatch).eq("id", pid).select("*").single();
    if (error || !data) throw new OrderError("DB_ERROR", `패키지 수정 실패: ${error?.message ?? "알 수 없는 오류"}`, 500);
    for (const f of oldPrivate) await removePrivateFile(f);
    for (const f of oldSample) await removeSampleFile(f);
    return mapProduct(data);
  } else {
    const { data, error } = await sb
      .from("products")
      .insert({ id: pid, grade: "고2", created_at: now, ...rowPatch })
      .select("*")
      .single();
    if (error || !data) throw new OrderError("DB_ERROR", `패키지 등록 실패: ${error?.message ?? "알 수 없는 오류"}`, 500);
    return mapProduct(data);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from("products").select("*").eq("id", id).maybeSingle();
  if (!data) throw new OrderError("NOT_FOUND", "패키지를 찾을 수 없습니다.", 404);
  const p = mapProduct(data);

  const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("product_id", id);
  if ((count ?? 0) > 0) {
    throw new OrderError("HAS_ORDERS", "주문 내역이 있는 패키지는 삭제할 수 없습니다. 판매 중지로 바꿔 주세요.", 409);
  }

  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw new OrderError("DB_ERROR", `패키지 삭제 실패: ${error.message}`, 500);
  await removePrivateFile(p.originalFilePath);
  await removeSampleFile(p.samplePdfUrl);
}

export async function allProductsWithStatus(): Promise<{ products: Product[]; dbError: string | null }> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("패키지 목록 조회 실패:", error.message);
      return { products: [], dbError: `Supabase 조회 오류: ${error.message}` };
    }
    return { products: (data ?? []).map(mapProduct), dbError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Supabase 연결 실패";
    console.error("패키지 목록 조회 예외:", msg);
    return { products: [], dbError: msg };
  }
}

export async function allProducts(): Promise<Product[]> {
  const { products } = await allProductsWithStatus();
  return products;
}
