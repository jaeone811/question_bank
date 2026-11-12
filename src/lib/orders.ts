import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Order, OrderStatus, Product, TaskChannel, TaskType } from "../db/schema";
import { activeTokenFor, issueDownloadToken } from "./tokens";
import type { OrderInput } from "./validation";

const { orders, products, agentTasks, agentLogs, downloadTokens } = schema;

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
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" })
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

export function logAgent(message: string, opts: { orderId?: string; taskId?: string; level?: "info" | "warn" | "error"; screenshotPath?: string } = {}) {
  getDb()
    .insert(agentLogs)
    .values({ message, orderId: opts.orderId, taskId: opts.taskId, level: opts.level ?? "info", screenshotPath: opts.screenshotPath, createdAt: Date.now() })
    .run();
}

function enqueue(orderId: string, taskType: TaskType, channel: TaskChannel, payload: object = {}) {
  const now = Date.now();
  getDb()
    .insert(agentTasks)
    .values({ id: randomUUID(), orderId, taskType, targetChannel: channel, payload: JSON.stringify(payload), createdAt: now, updatedAt: now })
    .run();
}

export function sellableProducts(): Product[] {
  return getDb()
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), isNotNull(products.originalFilePath)))
    .orderBy(products.sortOrder, products.createdAt)
    .all();
}

// 주문 접수: 금액은 서버가 상품 가격으로 계산. 접수 알림 작업을 큐에 넣음
export function createOrder(input: OrderInput) {
  const db = getDb();
  return db.transaction(() => {
    const product = db.select().from(products).where(eq(products.id, input.productId)).get();
    if (!product || !product.isActive || !product.originalFilePath) throw new OrderError("INVALID_PRODUCT", "지금은 구매할 수 없는 자료입니다.");
    const now = Date.now();
    const order = {
      id: randomUUID(),
      orderNumber: newOrderNumber(now),
      productId: product.id,
      buyerName: input.buyerName,
      depositorName: input.depositorName,
      buyerEmail: input.buyerEmail,
      buyerInstagram: input.buyerInstagram,
      buyerPhone: input.buyerPhone,
      preferredChannel: input.preferredChannel,
      paymentMethod: input.paymentMethod,
      totalAmount: product.price,
      status: "PENDING_VERIFICATION" as OrderStatus,
      createdAt: now,
    };
    db.insert(orders).values(order).run();
    for (const ch of channelsOf(order)) enqueue(order.id, "SEND_RECEIPT_ACK", ch);
    return { order, product };
  });
}

const APPROVABLE: OrderStatus[] = ["PENDING_VERIFICATION", "NOTIFIED_USER"];
const REISSUABLE: OrderStatus[] = ["APPROVED", "DISPATCHING", "DELIVERED", "DISPATCH_FAILED", "EXPIRED"];

function dispatch(order: Order, approvedAt: number) {
  const db = getDb();
  const { url, expiresAt } = issueDownloadToken(order.id, order.productId, approvedAt);
  // 아직 안 나간 작업은 건너뜀 (접수 알림이 링크보다 늦게 가는 일 방지)
  db.update(agentTasks)
    .set({ status: "SKIPPED", errorMessage: "새 발송 작업으로 대체", updatedAt: Date.now() })
    .where(and(eq(agentTasks.orderId, order.id), inArray(agentTasks.status, ["QUEUED", "AWAITING_HUMAN_AUTH"])))
    .run();
  for (const ch of channelsOf(order)) enqueue(order.id, "SEND_DOWNLOAD_LINK", ch, { downloadUrl: url, expiresAt });
  return { url, expiresAt };
}

// 관리자 승인: 승인 시각 + 5시간짜리 링크 발급 → 발송 작업을 큐에 넣음
export function approveOrder(orderId: string) {
  const db = getDb();
  return db.transaction(() => {
    const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
    if (!APPROVABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "이미 처리된 주문입니다.", 409);
    const approvedAt = Date.now();
    db.update(orders).set({ status: "APPROVED", approvedAt, deliveredAt: null }).where(eq(orders.id, orderId)).run();
    const link = dispatch(order, approvedAt);
    logAgent(`관리자 승인: ${order.orderNumber} 링크 발급, 발송 대기`, { orderId });
    return { orderNumber: order.orderNumber, approvedAt, ...link };
  });
}

// 재발급: 이전 링크를 폐기하고 지금부터 5시간짜리 링크를 다시 보냄
export function reissueOrder(orderId: string) {
  const db = getDb();
  return db.transaction(() => {
    const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
    if (!REISSUABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "승인된 주문만 재발급할 수 있습니다.", 409);
    const now = Date.now();
    db.update(orders).set({ status: "APPROVED", reissueRequestedAt: null, deliveredAt: null }).where(eq(orders.id, orderId)).run();
    const link = dispatch(order, now);
    logAgent(`링크 재발급: ${order.orderNumber}`, { orderId });
    return { orderNumber: order.orderNumber, ...link };
  });
}

export function rejectOrder(orderId: string, memo?: string) {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
  if (!APPROVABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "이미 처리된 주문입니다.", 409);
  db.update(orders).set({ status: "REJECTED", adminMemo: memo?.slice(0, 200) || null }).where(eq(orders.id, orderId)).run();
  db.update(agentTasks)
    .set({ status: "SKIPPED", errorMessage: "입금 미확인 처리", updatedAt: Date.now() })
    .where(and(eq(agentTasks.orderId, orderId), inArray(agentTasks.status, ["QUEUED", "AWAITING_HUMAN_AUTH"])))
    .run();
  logAgent(`입금 미확인 처리: ${order.orderNumber}`, { orderId, level: "warn" });
}

// 자동 발송이 막혀 관리자가 직접 보낸 경우
export function markDeliveredManually(orderId: string) {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new OrderError("NOT_FOUND", "주문을 찾을 수 없습니다.", 404);
  if (!["APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(order.status)) throw new OrderError("BAD_STATUS", "발송 대기 중인 주문이 아닙니다.", 409);
  db.update(orders).set({ status: "DELIVERED", deliveredAt: Date.now() }).where(eq(orders.id, orderId)).run();
  db.update(agentTasks)
    .set({ status: "SKIPPED", errorMessage: "관리자가 직접 발송", updatedAt: Date.now() })
    .where(and(eq(agentTasks.orderId, orderId), inArray(agentTasks.status, ["QUEUED", "AWAITING_HUMAN_AUTH"])))
    .run();
  logAgent(`관리자가 직접 발송 완료 처리: ${order.orderNumber}`, { orderId });
}

export function retryTask(taskId: string) {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) throw new OrderError("NOT_FOUND", "작업을 찾을 수 없습니다.", 404);
  if (task.status !== "FAILED") throw new OrderError("BAD_STATUS", "실패한 작업만 다시 시도할 수 있습니다.", 409);
  db.update(agentTasks).set({ status: "QUEUED", errorMessage: null, updatedAt: Date.now() }).where(eq(agentTasks.id, taskId)).run();
}

// 구매자의 재발급 요청 (주문번호 + 연락처 일치 확인)
export function requestReissue(orderNumber: string, contact: string) {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.orderNumber, orderNumber.trim().toUpperCase())).get();
  const c = contact.trim().toLowerCase().replace(/^@+/, "");
  const phone = c.replace(/[\s-]/g, "");
  const match = order && (order.buyerEmail === c || order.buyerInstagram === c || order.buyerPhone === phone);
  if (!order || !match) throw new OrderError("NOT_FOUND", "주문번호와 연락처가 일치하는 주문을 찾지 못했습니다.", 404);
  if (!REISSUABLE.includes(order.status)) throw new OrderError("BAD_STATUS", "아직 입금 확인이 끝나지 않은 주문입니다.", 409);
  if (order.reissueRequestedAt) return { orderNumber: order.orderNumber, already: true };
  db.update(orders).set({ reissueRequestedAt: Date.now() }).where(eq(orders.id, order.id)).run();
  logAgent(`구매자 재발급 요청: ${order.orderNumber}`, { orderId: order.id, level: "warn" });
  return { orderNumber: order.orderNumber, already: false };
}

// 구매자 상태 페이지용 (개인정보는 내보내지 않음)
export function publicOrderStatus(orderNumber: string) {
  const db = getDb();
  const row = db
    .select({ order: orders, product: products })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.orderNumber, orderNumber.toUpperCase()))
    .get();
  if (!row) return null;
  const { order, product } = row;
  const token = activeTokenFor(order.id);
  let status = order.status;
  if (status === "DELIVERED" && token && Date.now() >= token.expiresAt) status = "EXPIRED";
  return {
    orderNumber: order.orderNumber,
    status,
    productLabel: [product.subject, product.title].filter(Boolean).join(" · "),
    amount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    depositorName: order.depositorName,
    channels: channelsOf(order),
    agentSeen: !!order.agentSeenAt,
    createdAt: order.createdAt,
    approvedAt: order.approvedAt,
    deliveredAt: order.deliveredAt,
    expiresAt: token && order.approvedAt ? token.expiresAt : null,
    downloadsLeft: token ? Math.max(0, token.maxDownloads - token.downloadCount) : null,
    reissueRequested: !!order.reissueRequestedAt,
  };
}

export function adminOverview() {
  const db = getDb();
  const rows = db
    .select({ order: orders, product: products })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .orderBy(desc(orders.createdAt))
    .limit(200)
    .all();
  const ids = rows.map((r) => r.order.id);
  const tasks = ids.length ? db.select().from(agentTasks).where(inArray(agentTasks.orderId, ids)).orderBy(agentTasks.createdAt).all() : [];
  const tokens = ids.length ? db.select().from(downloadTokens).where(and(inArray(downloadTokens.orderId, ids), eq(downloadTokens.isRevoked, false))).all() : [];
  const logs = db.select().from(agentLogs).orderBy(desc(agentLogs.id)).limit(60).all();
  const state = Object.fromEntries(db.select().from(schema.agentState).all().map((s) => [s.key, { value: s.value, updatedAt: s.updatedAt }]));
  return {
    now: Date.now(),
    orders: rows.map(({ order, product }) => {
      const token = tokens.find((t) => t.orderId === order.id);
      return {
        ...order,
        productLabel: [product.subject, product.title].filter(Boolean).join(" · "),
        tasks: tasks
          .filter((t) => t.orderId === order.id)
          .map((t) => {
            const p = JSON.parse(t.payload) as { message?: string };
            return { id: t.id, taskType: t.taskType, targetChannel: t.targetChannel, status: t.status, attempts: t.attempts, screenshotPath: t.screenshotPath, errorMessage: t.errorMessage, updatedAt: t.updatedAt, message: p.message ?? null };
          }),
        token: token ? { expiresAt: token.expiresAt, downloadCount: token.downloadCount, maxDownloads: token.maxDownloads } : null,
      };
    }),
    logs,
    state,
  };
}
export type AdminOverview = ReturnType<typeof adminOverview>;
export type PublicOrderStatus = NonNullable<ReturnType<typeof publicOrderStatus>>;
