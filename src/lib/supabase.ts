import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

export const BUCKETS = {
  questions: "questions",
  samples: "samples",
} as const;

let client: SupabaseClient | undefined;
let bucketsEnsured = false;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, serviceRoleKey } = config.supabase;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. .env.local 또는 배포 환경변수를 확인해 주세요.",
    );
  }
  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function ensureBuckets(): Promise<void> {
  if (bucketsEnsured) return;
  const sb = getSupabase();
  const { data } = await sb.storage.listBuckets();
  const existing = new Set((data ?? []).map((b) => b.id));
  if (!existing.has(BUCKETS.questions)) {
    await sb.storage.createBucket(BUCKETS.questions, { public: false });
  }
  if (!existing.has(BUCKETS.samples)) {
    await sb.storage.createBucket(BUCKETS.samples, { public: true });
  }
  bucketsEnsured = true;
}

export async function uploadPrivateFile(name: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await ensureBuckets();
  const { error } = await getSupabase()
    .storage.from(BUCKETS.questions)
    .upload(name, bytes, { contentType, upsert: true });
  if (error) throw new Error(`원본 파일 업로드 실패: ${error.message}`);
}

export async function downloadPrivateFile(name: string): Promise<Uint8Array> {
  const { data, error } = await getSupabase().storage.from(BUCKETS.questions).download(name);
  if (error || !data) throw new Error(`원본 파일 다운로드 실패: ${error?.message ?? "파일 없음"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removePrivateFile(name: string | null | undefined): Promise<void> {
  if (!name) return;
  await getSupabase().storage.from(BUCKETS.questions).remove([name]);
}

export async function uploadSampleFile(name: string, bytes: Uint8Array): Promise<void> {
  await ensureBuckets();
  const { error } = await getSupabase()
    .storage.from(BUCKETS.samples)
    .upload(name, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`샘플 PDF 업로드 실패: ${error.message}`);
}

export async function downloadSampleFile(name: string): Promise<Uint8Array> {
  const { data, error } = await getSupabase().storage.from(BUCKETS.samples).download(name);
  if (error || !data) throw new Error(`샘플 PDF 다운로드 실패: ${error?.message ?? "파일 없음"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeSampleFile(name: string | null | undefined): Promise<void> {
  if (!name) return;
  await getSupabase().storage.from(BUCKETS.samples).remove([name]);
}
