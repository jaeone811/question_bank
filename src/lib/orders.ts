import { randomBytes, randomUUID } from "node:crypto";
import {
  mapDownloadToken,
  mapOrder,
  mapOrderLog,
  mapProduct,
  type Order,
  type OrderLog,
  type OrderStatus,
  type Product,
  type TaskChannel,
} from "@/db/schema";
import { config } from "./config";
import { isEmailConfigured, notifyPickleWebhook, sendEmail } from "./email";
import { productLabel } from "./format";
import { ackMessage, linkMessage } from "./messages";
import { getSupabase } from "./supabase";
import { activeTokenFor, issueDownloadToken } from "./tokens";
import type { OrderInput } from "./validation";

export class OrderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 헷갈리는 I, L, O, U 제외
function newOrderNumber(now: number) {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(now))
    .replace(/-/g, "");
  const rand = Array.from(randomBytes(8), (b) => ALPHABET[b % 32]).join("");
  return `QB-${d}-${rand}`;
}

export function channelsOf(o: Pick<Order, "preferredChannel" | "buyerEmail" | "buyerInstagram">): TaskChannel[] {
  const out: TaskChannel[] = [];
  if (o.preferredChannel !== "EMAIL" && o.buyerInstagram) out.push("INSTAGRAM");
  if (o.preferredChannel !== "INSTAGRAM_DM" && o.buyerEmail) out.push("EMAIL");
  return out;
}

export async function logOrder(
  message: string,
  opts: { orderId?: string; level?: "info" | "warn" | "error" } = {},
): Promise<void> {
  try {
    await getSupabase().from("order_logs").insert({
      order_id: opts.orderId ?? null,
      level: opts.level ?? "info",
      message,
      created_at: Date.now(),
    });
  } catch (e) {
    console.error("[order_logs] 기록 실패:", e);
  }
}

export async function sellableProducts(): Promise<Product[]> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("is_active", true)
      .not("original_file_path", "is", null)
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("판매 상품 조회 실패:", error.message);
      return [];
    }
    return (data ?? []).map(mapProduct);
  } catch (e) {
    console.error("판매 상품 조회 예외:", e);
    return [];
  }
}

// 주문 접수: 금액은 서버가 상품 가격으로 계산. 이메일 접수 안내 및 피클 AI 웹훅 호출
export async function createOrder(input: OrderInput): Promise<{ order: Order; product: Product }> {
  const sb = getSupabase();
  const { data: prodRow } = await sb.from("products").select("*").eq("id", input.productId).maybeSingle();
  if (!prodRow) throw new OrderError("INVALID_PRODUCT", "지금은 구매할 수 없는 자료입니다.");
  const product = mapProduct(prodRow);
  if (!product.isActive || !product.originalFilePath) {
    throw new OrderError("INVALID_PRODUCT", "지금은 구매할 수 없는 자료입니다.");
  }

  const now = Date.now();
  const id = randomUUID();
  const orderNumber = newOrderNumber(now);
  let status: OrderStatus = "PENDING_VERIFICATION";

  const { data: inserted, error } = await sb
    .from("orders")
    .insert({
      id,
      order_number: orderNumber,
      product_id: product.id,
      buyer_name: input.buyerName,
      depositor_name: input.depositorName,
      buyer_email: input.buyerEmail,
      buyer_instagram: input.buyerInstagram,
      buyer_phone: input.buyerPhone,
      preferred_channel: input.preferredChannel,
      payment_method: input.paymentMethod,
      total_amount: product.price,
      status,
      created_at: now,
    })
    .select("*")
    .single();

  if (error || !inserted) throw new Error(`주문 생성 실패: ${error?.message}`);
  const order = mapOrder(inserted);

  await logOrder(`새 주문 접수: ${order.orderNumber} (${order.depositorName}, ${productLabel(product)})`, {
    orderId: order.id,
  });

  const channels = channelsOf(order);
  const ack = ackMessage(order.buyerName, product);

  // 이메일 접수 알림 (설정된 경우 즉시 발송)
  if (channels.includes("EMAIL") && order.buyerEmail && isEmailConfigured()) {
    try {
      await sendEmail(order.buyerEmail, `[기말고사 문제은행] 주문이 접수되었습니다 (${order.orderNumber})`, ack);
      status = "NOTIFIED_USER";
      await sb.from("orders").update({ status }).eq("id", order.id);
      order.status = status;
    } catch (e) {
      console.error("접수 안내 이메일 발송 실패:", e);
    }
  }

  // 피클 AI 웹훅 알림 (설정된 경우)
  if (channels.includes("INSTAGRAM")) {
    const ok = await notifyPickleWebhook("order.created", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      buyerName: order.buyerName,
      depositorName: order.depositorName,
      buyerInstagram: order.buyerInstagram,
      buyerPhone: order.buyerPhone,
      productTitle: productLabel(product),
      amount: order.totalAmount,
      message: ack,
    });
    if (ok && status === "PENDING_VERIFICATION") {
      status = "NOTIFIED_USER";
      await sb.from("orders").update({ status }).eq("id", order.id);
      order.status = status;
    }
  }

  return { order, product };
}

const APPROVABLE: OrderStatus[] = ["PENDING_VERIFICATION", "NOTIFIED_USER"];
const REISSUABLE: OrderStatus[] = ["APPROVED", "DISPATCHING", "DELIVERED", "DISPATCH_FAILED", "EXPIRED"];

async function dispatchOrderLink(order: Order, product: Product, approvedAt: number, isReissue = false) {
  const sb = getSupabase();
  const { url, expiresAt } = await issueDownloadToken(order.id, order.productId, approvedAt);
  const message = linkMessage(order.buyerName, product, url, expiresAt, config.maxDownloads);
  const channels = channelsOf(order);

  let emailSentAt: number | null = order.emailSentAt;
  let emailError: string | null = null;
  let emailDelivered = false;
  let igDelivered = false;

  if (channels.includes("EMAIL") && order.buyerEmail) {
    if (isEmailConfigured()) {
      try {
        await sendEmail(
          order.buyerEmail,
          `[기말고사 문제은행] ${productLabel(product)} 다운로드 링크 안내 (${order.orderNumber})`,
          message,
        );
        emailSentAt = Date.now();
        emailDelivered = true;
        await logOrder(`이메일 링크 발송 완료: ${order.orderNumber} → ${order.buyerEmail}`, { orderId: order.id });
      } catch (e) {
        emailError = e instanceof Error ? e.message : "이메일 발송 오류";
        await logOrder(`이메일 발송 실패: ${order.orderNumber} (${emailError})`, { orderId: order.id, level: "error" });
      }
    } else {
      emailError = "GMAIL_USER / GMAIL_APP_PASSWORD 미설정 (관리자 화면에서 링크 복사 가능)";
    }
  }

  if (channels.includes("INSTAGRAM") && order.buyerInstagram) {
    igDelivered = await notifyPickleWebhook(isReissue ? "order.reissued" : "order.approved", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      buyerName: order.buyerName,
      buyerInstagram: order.buyerInstagram,
      buyerPhone: order.buyerPhone,
      productTitle: productLabel(product),
      downloadUrl: url,
      expiresAt,
      maxDownloads: config.maxDownloads,
      message,
    });
    if (igDelivered) {
      await logOrder(`피클 AI 웹훅으로 인스타 발송 요청 전달: ${order.orderNumber} (@${order.buyerInstagram})`, {
        orderId: order.id,
      });
    }
  }

  const allDone =
    (channels.includes("EMAIL") ? emailDelivered : true) &&
    (channels.includes("INSTAGRAM") ? igDelivered : true);

  const nextStatus: OrderStatus = allDone ? "DELIVERED" : "APPROVED";
  const deliveredAt = allDone ? Date.now() : null;

  await sb
    .from("orders")
    .update({
      status: nextStatus,
      approved_at: approvedAt,
      delivered_at: deliveredAt,
      reissue_requested_at: null,
      download_url: url,
      email_sent_at: emailSentAt,
      email_error: emailError,
    })
    .eq("id", order.id);

  return { url, expiresAt, message, status: nextStatus };
}

// 관리자 승인: 승인 시각 + 5시간짜리 링크 발급 → 이메일 자동 발송 및 피클 AI / 인스타 DM용 링크 생성
export async function approveOrder(orderId: string) {
  const sb = getSupabase();
  const { data: ordRow } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!ordRow) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
  const order = mapOrder(ordRow);
  if (!APPROVABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "이미 처리된 주문입니다.", 409);

  const { data: prodRow } = await sb.from("products").select("*").eq("id", order.productId).maybeSingle();
  if (!prodRow) throw new OrderError("NOT_FOUND", "상품 정보를 찾을 수 없습니다.", 404);
  const product = mapProduct(prodRow);

  const approvedAt = Date.now();
  const link = await dispatchOrderLink(order, product, approvedAt, false);
  await logOrder(`관리자 승인 및 5시간 링크 발급: ${order.orderNumber}`, { orderId });
  return { orderNumber: order.orderNumber, approvedAt, ...link };
}

// 재발급: 이전 링크를 폐기하고 지금부터 5시간짜리 링크를 다시 발급
export async function reissueOrder(orderId: string) {
  const sb = getSupabase();
  const { data: ordRow } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!ordRow) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
  const order = mapOrder(ordRow);
  if (!REISSUABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "승인된 주문만 재발급할 수 있습니다.", 409);

  const { data: prodRow } = await sb.from("products").select("*").eq("id", order.productId).maybeSingle();
  if (!prodRow) throw new OrderError("NOT_FOUND", "상품 정보를 찾을 수 없습니다.", 404);
  const product = mapProduct(prodRow);

  const now = Date.now();
  const link = await dispatchOrderLink(order, product, order.approvedAt ?? now, true);
  await logOrder(`다운로드 링크 재발급: ${order.orderNumber}`, { orderId });
  return { orderNumber: order.orderNumber, ...link };
}

export async function rejectOrder(orderId: string, memo?: string) {
  const sb = getSupabase();
  const { data: ordRow } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!ordRow) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
  const order = mapOrder(ordRow);
  if (!APPROVABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "이미 처리된 주문입니다.", 409);

  await sb
    .from("orders")
    .update({ status: "REJECTED", admin_memo: memo?.slice(0, 200) || null })
    .eq("id", orderId);
  await logOrder(`입금 미확인 처리: ${order.orderNumber}`, { orderId, level: "warn" });
}

// 피클 AI 또는 관리자가 DM/메시지로 링크 전달을 마친 경우 완료 처리
export async function markDeliveredManually(orderId: string) {
  const sb = getSupabase();
  const { data: ordRow } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!ordRow) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
  const order = mapOrder(ordRow);
  if (!["APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(order.status)) {
    throw new OrderError("BAD_STATUS", "발송 대기 중인 주문이 아닙니다.", 409);
  }
  await sb.from("orders").update({ status: "DELIVERED", delivered_at: Date.now() }).eq("id", orderId);
  await logOrder(`링크 전달 완료 처리: ${order.orderNumber}`, { orderId });
}

// 구매자의 재발급 요청 (주문번호 + 연락처 일치 확인)
export async function requestReissue(orderNumber: string, contact: string) {
  const sb = getSupabase();
  const { data: ordRow } = await sb
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber.trim().toUpperCase())
    .maybeSingle();
  if (!ordRow) throw new OrderError("NOT_FOUND", "주문번호와 연락처가 일치하는 주문을 찾지 못했습니다.", 404);
  const order = mapOrder(ordRow);

  const c = contact.trim().toLowerCase().replace(/^@+/, "");
  const phone = c.replace(/[\s-]/g, "");
  const match = order.buyerEmail === c || order.buyerInstagram === c || order.buyerPhone === phone;
  if (!match) throw new OrderError("NOT_FOUND", "주문번호와 연락처가 일치하는 주문을 찾지 못했습니다.", 404);
  if (!REISSUABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "아직 입금 확인이 끝나지 않은 주문입니다.", 409);
  if (order.reissueRequestedAt) return { orderNumber: order.orderNumber, already: true };

  await sb.from("orders").update({ reissue_requested_at: Date.now() }).eq("id", order.id);
  await logOrder(`구매자 재발급 요청: ${order.orderNumber}`, { orderId: order.id, level: "warn" });
  return { orderNumber: order.orderNumber, already: false };
}

// 구매자 상태 페이지용 (개인정보는 내보내지 않음)
export async function publicOrderStatus(orderNumber: string) {
  const sb = getSupabase();
  const { data: ordRow } = await sb
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber.toUpperCase())
    .maybeSingle();
  if (!ordRow) return null;
  const order = mapOrder(ordRow);

  const { data: prodRow } = await sb.from("products").select("*").eq("id", order.productId).maybeSingle();
  if (!prodRow) return null;
  const product = mapProduct(prodRow);

  const token = await activeTokenFor(order.id);
  let status = order.status;
  if ((status === "DELIVERED" || status === "APPROVED") && token && Date.now() >= token.expiresAt) {
    status = "EXPIRED";
  }

  return {
    orderNumber: order.orderNumber,
    status,
    productLabel: [product.subject, product.title].filter(Boolean).join(" · "),
    amount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    depositorName: order.depositorName,
    channels: channelsOf(order),
    agentSeen: true,
    createdAt: order.createdAt,
    approvedAt: order.approvedAt,
    deliveredAt: order.deliveredAt,
    expiresAt: token && order.approvedAt ? token.expiresAt : null,
    downloadsLeft: token ? Math.max(0, token.maxDownloads - token.downloadCount) : null,
    reissueRequested: !!order.reissueRequestedAt,
  };
}

export async function adminOverview() {
  const sb = getSupabase();
  const [ordersRes, productsRes, tokensRes, logsRes] = await Promise.all([
    sb.from("orders").select("*").order("created_at", { ascending: false }).limit(200),
    sb.from("products").select("*"),
    sb.from("download_tokens").select("*").eq("is_revoked", false),
    sb.from("order_logs").select("*").order("id", { ascending: false }).limit(60),
  ]);

  const orderList = (ordersRes.data ?? []).map(mapOrder);
  const productMap = new Map<string, Product>((productsRes.data ?? []).map((r) => {
    const p = mapProduct(r);
    return [p.id, p];
  }));
  const activeTokens = (tokensRes.data ?? []).map(mapDownloadToken);
  const logs: OrderLog[] = (logsRes.data ?? []).map(mapOrderLog);

  return {
    now: Date.now(),
    orders: orderList.map((order) => {
      const product = productMap.get(order.productId);
      const label = product ? [product.subject, product.title].filter(Boolean).join(" · ") : order.productId;
      const token = activeTokens.find((t) => t.orderId === order.id);
      const dmMessage =
        order.downloadUrl && token && product
          ? linkMessage(order.buyerName, product, order.downloadUrl, token.expiresAt, token.maxDownloads)
          : null;
      return {
        ...order,
        productLabel: label,
        dmMessage,
        token: token
          ? { expiresAt: token.expiresAt, downloadCount: token.downloadCount, maxDownloads: token.maxDownloads }
          : null,
      };
    }),
    logs,
  };
}

// 피클 AI 연동용 주문/링크 조회 (주문번호, 인스타 아이디, 전화번호 중 하나로 최신 주문 조회)
export async function findOrderForPickle(query: { orderNumber?: string; instagram?: string; phone?: string }) {
  const sb = getSupabase();
  let q = sb.from("orders").select("*").order("created_at", { ascending: false }).limit(1);
  if (query.orderNumber) {
    q = q.eq("order_number", query.orderNumber.trim().toUpperCase());
  } else if (query.instagram) {
    q = q.eq("buyer_instagram", query.instagram.trim().toLowerCase().replace(/^@+/, ""));
  } else if (query.phone) {
    q = q.eq("buyer_phone", query.phone.trim().replace(/[\s-]/g, ""));
  } else {
    return null;
  }

  const { data: ordRow } = await q.maybeSingle();
  if (!ordRow) return null;
  const order = mapOrder(ordRow);

  const { data: prodRow } = await sb.from("products").select("*").eq("id", order.productId).maybeSingle();
  const product = prodRow ? mapProduct(prodRow) : null;
  const token = await activeTokenFor(order.id);
  const message =
    order.downloadUrl && token && product
      ? linkMessage(order.buyerName, product, order.downloadUrl, token.expiresAt, token.maxDownloads)
      : null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    buyerName: order.buyerName,
    depositorName: order.depositorName,
    buyerInstagram: order.buyerInstagram,
    productTitle: product ? productLabel(product) : order.productId,
    amount: order.totalAmount,
    downloadUrl: order.downloadUrl,
    expiresAt: token?.expiresAt ?? null,
    downloadsLeft: token ? Math.max(0, token.maxDownloads - token.downloadCount) : null,
    message,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
export type PublicOrderStatus = NonNullable<Awaited<ReturnType<typeof publicOrderStatus>>>;
