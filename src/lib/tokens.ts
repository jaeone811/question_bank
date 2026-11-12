import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { appSecret, config, LINK_TTL_MS } from "./config";

const { downloadTokens } = schema;

const sign = (body: string) => createHmac("sha256", appSecret()).update(body).digest("base64url");
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

// 토큰 = <랜덤>.<만료시각(초)>.<HMAC-SHA256 서명>
// DB 에는 원문 대신 SHA-256 해시만 저장
export function issueDownloadToken(orderId: string, productId: string, approvedAt: number) {
  const db = getDb();
  const expiresAt = approvedAt + LINK_TTL_MS;
  const body = `${randomBytes(18).toString("base64url")}.${Math.floor(expiresAt / 1000)}`;
  const raw = `${body}.${sign(body)}`;
  // 같은 주문의 이전 링크는 모두 폐기
  db.update(downloadTokens).set({ isRevoked: true }).where(eq(downloadTokens.orderId, orderId)).run();
  db.insert(downloadTokens)
    .values({
      id: randomUUID(),
      orderId,
      productId,
      tokenHash: hashToken(raw),
      expiresAt,
      maxDownloads: config.maxDownloads,
      createdAt: Date.now(),
    })
    .run();
  return { raw, expiresAt, url: `${config.siteUrl}/api/download/${raw}` };
}

export type TokenFailure = "invalid" | "revoked" | "expired" | "limit";
export type TokenCheck =
  | { ok: true; token: schema.DownloadToken }
  | { ok: false; reason: TokenFailure; orderId?: string };

function verifySignature(raw: string): boolean {
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// 서명 → DB → 폐기 → 만료 → 횟수 순으로 확인하고, 통과하면 횟수를 원자적으로 1 올림
export function consumeDownloadToken(raw: string, ip: string, now = Date.now()): TokenCheck {
  if (!verifySignature(raw)) return { ok: false, reason: "invalid" };
  const db = getDb();
  const row = db.select().from(downloadTokens).where(eq(downloadTokens.tokenHash, hashToken(raw))).get();
  if (!row) return { ok: false, reason: "invalid" };
  if (row.isRevoked) return { ok: false, reason: "revoked", orderId: row.orderId };
  if (now >= row.expiresAt) return { ok: false, reason: "expired", orderId: row.orderId };
  if (row.downloadCount >= row.maxDownloads) return { ok: false, reason: "limit", orderId: row.orderId };

  const ipLog = [...(JSON.parse(row.clientIpLog) as { ip: string; at: number }[]), { ip, at: now }].slice(-20);
  const res = db
    .update(downloadTokens)
    .set({
      downloadCount: sql`${downloadTokens.downloadCount} + 1`,
      lastDownloadedAt: now,
      clientIpLog: JSON.stringify(ipLog),
    })
    .where(
      and(
        eq(downloadTokens.id, row.id),
        eq(downloadTokens.isRevoked, false),
        gt(downloadTokens.expiresAt, now),
        lt(downloadTokens.downloadCount, downloadTokens.maxDownloads),
      ),
    )
    .run();
  if (res.changes !== 1) return { ok: false, reason: "limit", orderId: row.orderId };
  return { ok: true, token: { ...row, downloadCount: row.downloadCount + 1 } };
}

// 파일 준비에 실패했을 때 차감한 횟수 되돌리기
export function refundDownload(tokenId: string) {
  getDb()
    .update(downloadTokens)
    .set({ downloadCount: sql`max(${downloadTokens.downloadCount} - 1, 0)` })
    .where(eq(downloadTokens.id, tokenId))
    .run();
}

export function activeTokenFor(orderId: string) {
  return getDb()
    .select()
    .from(downloadTokens)
    .where(and(eq(downloadTokens.orderId, orderId), eq(downloadTokens.isRevoked, false)))
    .get();
}
