import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

export const BUCKETS = {
  questions: "questions",
  samples: "samples",
} as const;

let client: SupabaseClient | undefined;
let bucketsEnsured = false;

export function checkKeyRole(key: string): "anon" | "service_role" | "unknown" {
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service_role";
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
      if (payload.role === "anon") return "anon";
      if (payload.role === "service_role") return "service_role";
    } catch {
      // ignore
    }
  }
  return "unknown";
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, serviceRoleKey } = config.supabase;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요.",
    );
  }
  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function formatSupabaseHint(errMessage: string): string {
  const role = checkKeyRole(config.supabase.serviceRoleKey);
  if (role === "anon" && /row-level security|not found|unauthorized|permission/i.test(errMessage)) {
    return `${errMessage} (현재 SUPABASE_SERVICE_ROLE_KEY에 anon/publishable 공개 키가 들어 있습니다. Supabase Settings > API 에서 service_role/secret 키로 바꾸거나, SQL Editor에서 최신 supabase/schema.sql을 다시 Run 해주세요.)`;
  }
  if (/relation .* does not exist|schema cache/i.test(errMessage)) {
    return `${errMessage} (Supabase Dashboard > SQL Editor 에서 supabase/schema.sql 을 붙여넣고 Run 해주세요.)`;
  }
  return errMessage;
}

export async function ensureBuckets(): Promise<void> {
  if (bucketsEnsured) return;
  const sb = getSupabase();
  const { data, error } = await sb.storage.listBuckets();
  if (!error && data) {
    const existing = new Set(data.map((b) => b.id));
    if (!existing.has(BUCKETS.questions)) {
      await sb.storage.createBucket(BUCKETS.questions, { public: false });
    }
    if (!existing.has(BUCKETS.samples)) {
      await sb.storage.createBucket(BUCKETS.samples, { public: true });
    }
    bucketsEnsured = true;
  }
}

export async function uploadPrivateFile(name: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await ensureBuckets();
  const { error } = await getSupabase()
    .storage.from(BUCKETS.questions)
    .upload(name, bytes, { contentType, upsert: true });
  if (error) throw new Error(`원본 파일 업로드 실패: ${formatSupabaseHint(error.message)}`);
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
  if (error) throw new Error(`샘플 PDF 업로드 실패: ${formatSupabaseHint(error.message)}`);
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
