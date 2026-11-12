import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getSupabase } from "./supabase";
import { mapDownloadToken, type DownloadToken } from "@/db/schema";
import { appSecret, config, LINK_TTL_MS } from "./config";

const sign = (body: string) => createHmac("sha256", appSecret()).update(body).digest("base64url");
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

// 토큰 = <랜덤>.<만료시각(초)>.<HMAC-SHA256 서명>
// DB 에는 원문 대신 SHA-256 해시만 저장
export async function issueDownloadToken(orderId: string, productId: string, approvedAt: number) {
  const sb = getSupabase();
  const expiresAt = approvedAt + LINK_TTL_MS;
  const body = `${randomBytes(18).toString("base64url")}.${Math.floor(expiresAt / 1000)}`;
  const raw = `${body}.${sign(body)}`;

  // 같은 주문의 이전 링크는 모두 폐기
  await sb.from("download_tokens").update({ is_revoked: true }).eq("order_id", orderId);

  const { error } = await sb.from("download_tokens").insert({
    id: randomUUID(),
    order_id: orderId,
    product_id: productId,
    token_hash: hashToken(raw),
    expires_at: expiresAt,
    download_count: 0,
    max_downloads: config.maxDownloads,
    client_ip_log: "[]",
    is_revoked: false,
    created_at: Date.now(),
  });
  if (error) throw new Error(`다운로드 토큰 발급 실패: ${error.message}`);

  return { raw, expiresAt, url: `${config.siteUrl}/api/download/${raw}` };
}

export type TokenFailure = "invalid" | "revoked" | "expired" | "limit";
export type TokenCheck =
  | { ok: true; token: DownloadToken }
  | { ok: false; reason: TokenFailure; orderId?: string };

function verifySignature(raw: string): boolean {
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// 서명 → DB → 폐기 → 만료 → 횟수 순으로 확인하고, 통과하면 횟수를 1 올림
export async function consumeDownloadToken(raw: string, ip: string, now = Date.now()): Promise<TokenCheck> {
  if (!verifySignature(raw)) return { ok: false, reason: "invalid" };
  const sb = getSupabase();
  const { data } = await sb.from("download_tokens").select("*").eq("token_hash", hashToken(raw)).maybeSingle();
  if (!data) return { ok: false, reason: "invalid" };
  const row = mapDownloadToken(data);
  if (row.isRevoked) return { ok: false, reason: "revoked", orderId: row.orderId };
  if (now >= row.expiresAt) return { ok: false, reason: "expired", orderId: row.orderId };
  if (row.downloadCount >= row.maxDownloads) return { ok: false, reason: "limit", orderId: row.orderId };

  const ipLog = [...(JSON.parse(row.clientIpLog) as { ip: string; at: number }[]), { ip, at: now }].slice(-20);
  const nextCount = row.downloadCount + 1;
  const { data: updated, error } = await sb
    .from("download_tokens")
    .update({
      download_count: nextCount,
      last_downloaded_at: now,
      client_ip_log: JSON.stringify(ipLog),
    })
    .eq("id", row.id)
    .eq("is_revoked", false)
    .eq("download_count", row.downloadCount)
    .gt("expires_at", now)
    .select("*")
    .maybeSingle();

  if (error || !updated) return { ok: false, reason: "limit", orderId: row.orderId };
  return { ok: true, token: mapDownloadToken(updated) };
}

// 파일 준비에 실패했을 때 차감한 횟수 되돌리기
export async function refundDownload(tokenId: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from("download_tokens").select("download_count").eq("id", tokenId).maybeSingle();
  if (!data) return;
  const next = Math.max(0, Number(data.download_count ?? 1) - 1);
  await sb.from("download_tokens").update({ download_count: next }).eq("id", tokenId);
}

export async function activeTokenFor(orderId: string): Promise<DownloadToken | undefined> {
  const sb = getSupabase();
  const { data } = await sb
    .from("download_tokens")
    .select("*")
    .eq("order_id", orderId)
    .eq("is_revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapDownloadToken(data) : undefined;
}
