// 전 과정 검증: 주문 → 에이전트 접수 알림 → 관리자 승인 → 5시간 링크 → 다운로드(워터마크) → 횟수 초과 → 만료 → 재발급
// 준비: 웹 서버가 SITE_URL 에서 실행 중이고 판매 중인 패키지가 1개 이상 있어야 함 (npm run seed:demo)
// 실행: npm run verify
import { existsSync } from "node:fs";
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb, schema } from "../src/db";
import { startMockInstagram } from "./mock-instagram";

const BASE = process.env.SITE_URL ?? "http://localhost:3000";
const db = getDb();
let failed = 0;
const check = (name: string, cond: unknown, detail = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
let cookie = "";
const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(BASE + path, {
    keepalive: false, redirect: "manual", ...init, headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) } });
  return res;
};
const post = (path: string, body: unknown = {}) => api(path, { method: "POST", body: JSON.stringify(body) });
const status = async (no: string) => (await (await api(`/api/orders/${no}`)).json()).data;

async function main() {
  const ig = await startMockInstagram();
  // 워커를 --once 로 한 바퀴 돌림 (가짜 인스타 서버가 같은 프로세스라 비동기로 실행)
  const worker = () =>
    new Promise<void>((resolve) => {
      const child = spawn("npx", ["tsx", "agent-worker/index.ts", "--once"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, INSTAGRAM_BASE_URL: ig.url, AGENT_HEADLESS: "true", AGENT_BRAIN: "template", AGENT_IG_MIN_INTERVAL_MS: "0", GMAIL_USER: "", GMAIL_APP_PASSWORD: "", TELEGRAM_BOT_TOKEN: "", DISCORD_WEBHOOK_URL: "" },
      });
      let out = "";
      child.stdout.on("data", (c) => (out += c));
      child.stderr.on("data", (c) => (out += c));
      child.on("close", (code) => {
        if (code !== 0 || process.env.VERBOSE) console.log(out);
        resolve();
      });
    });
  const product = db.select().from(schema.products).all().find((p) => p.isActive && p.originalFilePath);
  if (!product) throw new Error("판매 중인 패키지가 없습니다. npm run seed:demo 를 먼저 실행해 주세요.");
  const order = (over: object = {}) => ({ productId: product.id, buyerName: "김검증", depositorName: "", buyerPhone: "010-1234-5678", buyerInstagram: "@Verify.User", buyerEmail: "verify@example.com", preferredChannel: "BOTH", paymentMethod: "BANK", agreeRefund: true, agreeCopyright: true, ...over });

  console.log("\n[1] 주문 접수");
  let res = await post("/api/orders", order({ buyerPhone: "123", agreeRefund: false, buyerInstagram: "한글" }));
  let json = await res.json();
  check("잘못된 입력은 422", res.status === 422 && json.errors.buyerPhone && json.errors.agreeRefund && json.errors.buyerInstagram);
  res = await post("/api/orders", order({ productId: "nope" }));
  check("없는 상품은 거부", res.status === 400);
  res = await post("/api/orders", order());
  json = await res.json();
  const no: string = json.data?.orderNumber;
  check("정상 주문 201 + 주문번호", res.status === 201 && /^QB-\d{6}-[0-9A-Z]{8}$/.test(no), no);
  check("금액은 서버 가격", json.data.amount === product.price);
  let s = await status(no);
  check("초기 상태 PENDING_VERIFICATION", s.status === "PENDING_VERIFICATION" && s.agentSeen === false && s.depositorName === "김검증");

  console.log("\n[2] 에이전트 접수 알림");
  await worker();
  s = await status(no);
  check("에이전트 확인 표시 + NOTIFIED_USER", s.agentSeen === true && s.status === "NOTIFIED_USER", s.status);
  check("인스타 DM 접수 알림 전송", ig.sent.length === 1 && ig.sent[0].user === "verify.user" && ig.sent[0].text.includes("주문이 접수되었습니다"), ig.sent[0]?.text);

  console.log("\n[3] 관리자 승인");
  const row = db.select().from(schema.orders).where(eq(schema.orders.orderNumber, no)).get()!;
  res = await post(`/api/admin/orders/${row.id}/approve`);
  check("로그인 없이 승인 불가 401", res.status === 401);
  res = await post("/api/admin/login", { password: "wrong" });
  check("틀린 비밀번호 401", res.status === 401);
  res = await post("/api/admin/login", { password: process.env.ADMIN_PASSWORD });
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  check("관리자 로그인", res.status === 200 && cookie.startsWith("qb_admin="));
  res = await api(`/api/admin/orders/${row.id}/approve`, { method: "POST", body: "{}", headers: { Origin: "https://evil.example" } });
  check("다른 출처의 요청 차단 403", res.status === 403);
  const t0 = Date.now();
  res = await post(`/api/admin/orders/${row.id}/approve`);
  json = await res.json();
  check("승인 200", res.status === 200);
  check("만료 시각 = 승인 + 5시간(18,000초)", Math.abs(json.data.expiresAt - t0 - 18_000_000) < 5000, String((json.data.expiresAt - t0) / 1000));
  res = await post(`/api/admin/orders/${row.id}/approve`);
  check("중복 승인 409", res.status === 409);

  console.log("\n[4] 링크 발송");
  await worker();
  s = await status(no);
  check("DELIVERED (인스타 성공, 이메일은 미설정으로 실패)", s.status === "DELIVERED", s.status);
  const dm = ig.sent[1]?.text ?? "";
  const url = dm.match(/https?:\/\/\S+\/api\/download\/\S+/)?.[0] ?? "";
  check("DM 에 링크와 만료 시각(한국 시간) 포함", !!url && dm.includes("한국 시간") && dm.includes("최대 3회"), dm.replace(/\n/g, " | "));
  const tasks = db.select().from(schema.agentTasks).where(eq(schema.agentTasks.orderId, row.id)).all();
  const done = tasks.find((t) => t.taskType === "SEND_DOWNLOAD_LINK" && t.targetChannel === "INSTAGRAM")!;
  check("전송 증거 캡처 저장", done.status === "COMPLETED" && !!done.screenshotPath && existsSync(`.agent-vault/screenshots/${done.screenshotPath}`), done.screenshotPath ?? "");
  check("완료된 작업에 링크 원문 미보관", !done.payload.includes("/api/download/"));
  check("DB 에는 토큰 해시만 저장", !db.select().from(schema.downloadTokens).all().some((t) => url.includes(t.tokenHash)));

  console.log("\n[5] 다운로드 게이트웨이");
  const path = new URL(url).pathname;
  res = await api(path);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  check("1회차 200 PDF", res.status === 200 && res.headers.get("content-type") === "application/pdf");
  check("워터마크(구매자·주문번호) 삽입", (pdf.getSubject() ?? "").includes(no) && pdf.getPageCount() === product.pageCount && bytes.length > 0, pdf.getSubject());
  res = await api(path + "x");
  check("변조된 토큰 차단", res.status === 303 && res.headers.get("location")!.includes("reason=invalid"));
  await api(path);
  res = await api(path);
  check("3회차까지 허용", res.status === 200 && res.headers.get("x-downloads-left") === "0");
  res = await api(path);
  check("4회차 차단 (횟수 초과)", res.status === 303 && res.headers.get("location")!.includes("reason=limit"));

  console.log("\n[6] 만료와 재발급");
  db.update(schema.downloadTokens).set({ expiresAt: Date.now() - 1000, downloadCount: 0 }).where(eq(schema.downloadTokens.orderId, row.id)).run();
  res = await api(path);
  check("5시간 경과 후 차단", res.status === 303 && res.headers.get("location")!.includes("reason=expired"));
  await worker();
  s = await status(no);
  check("주문 상태 EXPIRED", s.status === "EXPIRED");
  res = await post("/api/orders/reissue", { orderNumber: no, contact: "someone.else" });
  check("연락처 불일치 재발급 요청 거부", res.status === 404);
  res = await post("/api/orders/reissue", { orderNumber: no, contact: "@verify.user" });
  check("재발급 요청 접수", res.status === 200);
  res = await post(`/api/admin/orders/${row.id}/reissue`);
  check("관리자 재발급 200", res.status === 200);
  res = await api(path);
  check("이전 링크는 폐기됨", res.status === 303 && res.headers.get("location")!.includes("reason=revoked"));
  await worker();
  const url2 = ig.sent.at(-1)!.text.match(/https?:\/\/\S+\/api\/download\/\S+/)?.[0] ?? "";
  s = await status(no);
  res = await api(new URL(url2).pathname);
  check("새 링크 발송 및 다운로드", s.status === "DELIVERED" && url2 !== url && res.status === 200);

  console.log("\n[7] 자동 발송이 막히는 경우");
  res = await post("/api/orders", order({ buyerInstagram: "ghost.user", buyerEmail: "", preferredChannel: "INSTAGRAM_DM", depositorName: "박입금" }));
  const no2 = (await res.json()).data.orderNumber;
  const row2 = db.select().from(schema.orders).where(eq(schema.orders.orderNumber, no2)).get()!;
  check("입금자명 별도 입력 반영", row2.depositorName === "박입금" && row2.buyerName === "김검증");
  await post(`/api/admin/orders/${row2.id}/approve`);
  await worker();
  s = await status(no2);
  const overview = (await (await api("/api/admin/overview")).json()).data;
  const failedTask = overview.orders.find((o: { orderNumber: string }) => o.orderNumber === no2).tasks.find((t: { status: string; taskType: string }) => t.taskType === "SEND_DOWNLOAD_LINK");
  check("계정 못 찾음 → DISPATCH_FAILED", s.status === "DISPATCH_FAILED" && failedTask.status === "FAILED", failedTask.errorMessage);
  check("수동 발송용 메시지 보존", failedTask.message?.includes("/api/download/"));
  res = await post(`/api/admin/orders/${row2.id}/mark-delivered`);
  check("직접 발송 완료 처리", res.status === 200 && (await status(no2)).status === "DELIVERED");

  console.log("\n[8] 로그인 필요 시 핸드오프");
  ig.requireLogin = true;
  res = await post("/api/orders", order({ buyerInstagram: "needs.login", buyerEmail: "", preferredChannel: "INSTAGRAM_DM" }));
  const no3 = (await res.json()).data.orderNumber;
  await worker();
  const row3 = db.select().from(schema.orders).where(eq(schema.orders.orderNumber, no3)).get()!;
  const t3 = db.select().from(schema.agentTasks).where(eq(schema.agentTasks.orderId, row3.id)).get()!;
  const auth = db.select().from(schema.agentState).where(eq(schema.agentState.key, "auth")).get()?.value;
  check("로그인 화면 감지 → 사람 인증 요청 상태", auth === "AWAITING_HUMAN_AUTH" && t3.status === "FAILED" && /로그인/.test(t3.errorMessage ?? ""), t3.errorMessage ?? "");
  res = await post(`/api/admin/orders/${row3.id}/reject`);
  check("입금 미확인 처리", res.status === 200 && (await status(no3)).status === "REJECTED");

  ig.server.close();
  console.log(`\n${failed === 0 ? "모든 검증 통과" : `실패 ${failed}건`}`);
  process.exit(failed ? 1 : 0);
}
void main();
