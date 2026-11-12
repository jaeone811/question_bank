// 자율 에이전트 워커: DB 를 폴링해 신규 주문 감지 → 접수 알림 → (관리자 승인 후) 링크 발송
// 실행: npm run agent   (웹 서버와 같은 폴더에서)
import { agentEnv } from "./env";
import { and, eq, gt, inArray, isNull, isNotNull, lte, ne } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import type { AgentTask, Order, Product } from "../src/db/schema";
import { config } from "../src/lib/config";
import { productLabel, won } from "../src/lib/format";
import { ackMessage, linkMessage } from "../src/lib/messages";
import { logAgent } from "../src/lib/orders";
import { activeTokenFor } from "../src/lib/tokens";
import { writeGreeting } from "./brain";
import { closeBrowser, getState, HumanAuthRequired, setState } from "./browser";
import { NotConfigured, sendEmail } from "./email";
import { DmBlocked, sendInstagramDm } from "./instagram";
import { notifyDeveloper } from "./notify";

const { orders, products, agentTasks, downloadTokens } = schema;
const db = getDb();
const once = process.argv.includes("--once"); // 큐가 빌 때까지만 돌고 종료 (검증용)

const heartbeat = () => setState("heartbeat", String(Date.now()));
const setTask = (id: string, patch: Partial<AgentTask>) => db.update(agentTasks).set({ ...patch, updatedAt: Date.now() }).where(eq(agentTasks.id, id)).run();
const channelLabel = (o: Order) => [o.buyerInstagram && `인스타 @${o.buyerInstagram}`, o.buyerEmail && `메일 ${o.buyerEmail}`].filter(Boolean).join(" / ");

// 1) 신규 주문 감지 → 상태 페이지에 "에이전트 확인" 표시 + 개발자 호출
async function detectNewOrders() {
  const fresh = db.select().from(orders).where(and(isNull(orders.agentSeenAt), eq(orders.status, "PENDING_VERIFICATION"))).all();
  for (const o of fresh) {
    db.update(orders).set({ agentSeenAt: Date.now() }).where(eq(orders.id, o.id)).run();
    logAgent(`신규 주문 확인: ${o.orderNumber} (입금자 ${o.depositorName}, ${won(o.totalAmount)}원)`, { orderId: o.id });
    await notifyDeveloper("[입금 확인 요청]", `입금자: ${o.depositorName} / ${won(o.totalAmount)}원 / ${channelLabel(o)}\n${config.siteUrl}/admin/agent`);
  }
}

// 2) 구매자의 재발급 요청 알림 (한 번만)
async function detectReissueRequests() {
  const last = Number(getState("reissue_notified_at") ?? 0);
  const rows = db.select().from(orders).where(and(isNotNull(orders.reissueRequestedAt), gt(orders.reissueRequestedAt, last))).all();
  if (!rows.length) return;
  setState("reissue_notified_at", String(Math.max(...rows.map((r) => r.reissueRequestedAt!))));
  for (const o of rows) await notifyDeveloper("[링크 재발급 요청]", `${o.orderNumber} / ${o.buyerName} / ${channelLabel(o)}\n${config.siteUrl}/admin/agent`);
}

// 3) 링크가 만료된 발송 완료 주문 정리
function sweepExpired() {
  const expired = db
    .select({ orderId: downloadTokens.orderId })
    .from(downloadTokens)
    .where(and(eq(downloadTokens.isRevoked, false), lte(downloadTokens.expiresAt, Date.now())))
    .all()
    .map((r) => r.orderId);
  if (expired.length) db.update(orders).set({ status: "EXPIRED" }).where(and(inArray(orders.id, expired), eq(orders.status, "DELIVERED"))).run();
}

// 작업 결과를 주문 상태에 반영
function reconcile(orderId: string) {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return;
  const tasks = db.select().from(agentTasks).where(and(eq(agentTasks.orderId, orderId), ne(agentTasks.status, "SKIPPED"))).all();
  if (order.status === "PENDING_VERIFICATION" && tasks.some((t) => t.taskType === "SEND_RECEIPT_ACK" && t.status === "COMPLETED")) {
    db.update(orders).set({ status: "NOTIFIED_USER" }).where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_VERIFICATION"))).run();
    return;
  }
  if (order.status !== "APPROVED" && order.status !== "DISPATCHING") return;
  const since = activeTokenFor(orderId)?.createdAt ?? 0;
  const links = tasks.filter((t) => t.taskType === "SEND_DOWNLOAD_LINK" && t.createdAt >= since);
  if (!links.length || links.some((t) => ["QUEUED", "RUNNING", "AWAITING_HUMAN_AUTH"].includes(t.status))) return;
  if (links.some((t) => t.status === "COMPLETED")) db.update(orders).set({ status: "DELIVERED", deliveredAt: Date.now() }).where(eq(orders.id, orderId)).run();
  else db.update(orders).set({ status: "DISPATCH_FAILED" }).where(eq(orders.id, orderId)).run();
}

async function buildMessage(task: AgentTask, order: Order, product: Product) {
  const label = productLabel(product);
  const kind = task.taskType === "SEND_RECEIPT_ACK" ? "ack" : "link";
  const g = await writeGreeting(kind, order.buyerName, label);
  if (g.text) logAgent(`인사말 작성: ${g.by} CLI`, { orderId: order.id, taskId: task.id });
  if (kind === "ack") return ackMessage(order.buyerName, product, g.text);
  const payload = JSON.parse(task.payload) as { downloadUrl?: string; expiresAt?: number };
  if (!payload.downloadUrl || !payload.expiresAt) throw new Error("발송할 링크 정보가 없습니다. 관리자 화면에서 재발급해 주세요.");
  if (Date.now() >= payload.expiresAt) throw new Error("링크가 이미 만료되었습니다. 관리자 화면에서 재발급해 주세요.");
  return linkMessage(order.buyerName, product, payload.downloadUrl, payload.expiresAt, config.maxDownloads, g.text);
}

async function runTask(task: AgentTask) {
  const row = db.select({ order: orders, product: products }).from(orders).innerJoin(products, eq(orders.productId, products.id)).where(eq(orders.id, task.orderId)).get();
  if (!row) return setTask(task.id, { status: "FAILED", errorMessage: "주문을 찾을 수 없음" });
  const { order, product } = row;
  const isAck = task.taskType === "SEND_RECEIPT_ACK";
  const log = (m: string, level: "info" | "warn" | "error" = "info") => {
    console.log(`  [${order.orderNumber}] ${m}`);
    logAgent(m, { orderId: order.id, taskId: task.id, level });
  };

  // 접수 알림은 아직 입금 확인 전인 주문에만 보냄
  if (isAck && order.status !== "PENDING_VERIFICATION") return setTask(task.id, { status: "SKIPPED", errorMessage: "이미 처리된 주문" });
  if (!isAck && !["APPROVED", "DISPATCHING"].includes(order.status)) return setTask(task.id, { status: "SKIPPED", errorMessage: "발송 대상 상태가 아님" });

  setTask(task.id, { status: "RUNNING", attempts: task.attempts + 1, errorMessage: null });
  if (!isAck) db.update(orders).set({ status: "DISPATCHING" }).where(and(eq(orders.id, order.id), eq(orders.status, "APPROVED"))).run();
  log(`${isAck ? "접수 알림" : "다운로드 링크"} 발송 시작 (${task.targetChannel === "INSTAGRAM" ? "인스타그램 DM" : "이메일"})`);

  let message = "";
  try {
    message = await buildMessage(task, order, product);
    const payload = { ...JSON.parse(task.payload), message };
    setTask(task.id, { payload: JSON.stringify(payload) });

    let screenshot: string | null = null;
    if (task.targetChannel === "EMAIL") {
      const subject = isAck ? `[기말고사 문제은행] 주문이 접수되었습니다 (${order.orderNumber})` : `[기말고사 문제은행] ${productLabel(product)} 다운로드 링크`;
      await sendEmail(order.buyerEmail!, subject, message);
    } else {
      screenshot = await sendInstagramDm({
        username: order.buyerInstagram!,
        message,
        evidenceName: `${order.orderNumber}-${isAck ? "ack" : "link"}-${Date.now()}`,
        log,
        onTick: heartbeat,
        onAwaitingAuth: () => {
          setTask(task.id, { status: "AWAITING_HUMAN_AUTH" });
          setState("auth", "AWAITING_HUMAN_AUTH");
          void notifyDeveloper("[에이전트 인증 필요]", "인스타그램 로그인 또는 추가 인증이 필요합니다. 에이전트 브라우저 창에서 직접 완료해 주세요.");
        },
        onAuthResolved: () => {
          setTask(task.id, { status: "RUNNING" });
          setState("auth", "OK");
        },
      });
    }
    // 완료된 작업에는 링크 원문을 남기지 않음
    setTask(task.id, { status: "COMPLETED", screenshotPath: screenshot, payload: JSON.stringify({ message: isAck ? message : undefined }) });
    logAgent(`발송 완료 (${task.targetChannel})`, { orderId: order.id, taskId: task.id, screenshotPath: screenshot ?? undefined });
    console.log(`  [${order.orderNumber}] 발송 완료`);
  } catch (e) {
    // Playwright 오류의 색상 코드와 호출 로그는 떼고 첫 줄만 기록
    const msg = (e instanceof Error ? e.message : String(e)).replace(/\x1b\[[0-9;]*m/g, "").split("\n")[0];
    const hint = e instanceof DmBlocked ? " 관리자 화면의 '직접 보내기'를 이용해 주세요." : "";
    setTask(task.id, { status: "FAILED", errorMessage: (msg + hint).slice(0, 500) });
    if (e instanceof HumanAuthRequired) setState("auth", "AWAITING_HUMAN_AUTH");
    log(`발송 실패: ${msg}`, "error");
    if (!isAck && !(e instanceof NotConfigured && order.preferredChannel === "BOTH"))
      await notifyDeveloper("[발송 실패]", `${order.orderNumber} / ${task.targetChannel}\n${msg}\n${config.siteUrl}/admin/agent`);
  } finally {
    reconcile(order.id);
  }
}

// 링크 발송을 접수 알림보다 먼저 처리
function nextTask(): AgentTask | undefined {
  const queued = db.select().from(agentTasks).where(eq(agentTasks.status, "QUEUED")).orderBy(agentTasks.createdAt).all();
  return queued.find((t) => t.taskType === "SEND_DOWNLOAD_LINK") ?? queued[0];
}

async function main() {
  // 비정상 종료로 멈춘 작업은 중복 발송을 피하려고 자동 재시도하지 않고 실패로 표시
  const stuck = db.select().from(agentTasks).where(inArray(agentTasks.status, ["RUNNING", "AWAITING_HUMAN_AUTH"])).all();
  for (const t of stuck) {
    setTask(t.id, { status: "FAILED", errorMessage: "워커가 재시작되어 중단됨. 전송 여부 확인 후 다시 시도해 주세요." });
    reconcile(t.orderId);
  }
  setState("auth", getState("auth") === "AWAITING_HUMAN_AUTH" ? "UNKNOWN" : (getState("auth") ?? "UNKNOWN"));
  setState("brain", agentEnv.brain);
  console.log(`에이전트 워커 시작 (폴링 ${agentEnv.pollMs}ms, 두뇌 ${agentEnv.brain}, 브라우저 ${agentEnv.headless ? "headless" : "창 표시"})`);
  logAgent("에이전트 워커 시작");

  let running = true;
  const stop = () => (running = false);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    heartbeat();
    try {
      await detectNewOrders();
      await detectReissueRequests();
      sweepExpired();
      const task = nextTask();
      if (task) {
        await runTask(task);
        continue; // 큐가 빌 때까지 바로 다음 작업
      }
    } catch (e) {
      console.error("루프 오류:", e);
      logAgent(`루프 오류: ${e instanceof Error ? e.message : String(e)}`, { level: "error" });
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, agentEnv.pollMs));
  }
  logAgent("에이전트 워커 종료");
  await closeBrowser();
  process.exit(0);
}

void main();
