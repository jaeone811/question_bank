// notify-order
// 1) orders 테이블 Database Webhook 수신 (x-webhook-secret 헤더)
//    INSERT            : 관리자에게 새 입금 신청 알림 메일 + (선택) 구글 시트 행 추가
//    UPDATE → APPROVED : EMAIL     → 비공개 버킷에서 PDF 를 꺼내 구매자 이메일로 첨부 발송
//                        INSTAGRAM → 5시간짜리 다운로드 링크(Signed URL) 생성 → 관리자가 DM 으로 직접 전달
//    UPDATE → REJECTED : (EMAIL 주문만) 구매자에게 입금 미확인 안내 메일
// 2) 관리자 페이지의 재발송 / 링크 재발급 요청 (관리자 로그인 토큰)
//    body: { action: "resend", orderNo }
//
// 배포: supabase functions deploy notify-order --no-verify-jwt
// 시크릿:
//   supabase secrets set WEBHOOK_SECRET=... RESEND_API_KEY=re_... \
//     ADMIN_EMAIL=me@example.com MAIL_FROM="기말고사 문제은행 <noreply@yourdomain.com>" \
//     SITE_URL=https://your-site.com GOOGLE_SHEET_WEBHOOK=https://script.google.com/macros/s/.../exec
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge Function 에 기본 주입됨)

import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";

type Order = {
  order_no: string;
  buyer_name: string;
  delivery_method: "EMAIL" | "INSTAGRAM";
  email: string | null;
  instagram_id: string | null;
  product_id: string;
  payment_method: "KAKAOPAY" | "BANK" | "TOSS";
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Order | null;
  old_record: Order | null;
};

const BUCKET = "products";
const INSTAGRAM_LINK_TTL = 60 * 60 * 5; // 5시간
const env = (k: string) => Deno.env.get(k) ?? "";
const METHOD_LABEL = { KAKAOPAY: "카카오페이", BANK: "계좌이체", TOSS: "토스/기타" };
const won = (n: number) => n.toLocaleString("ko-KR");
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const cors = {
  "Access-Control-Allow-Origin": env("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

type Attachment = { filename: string; content: string };

async function sendMail(to: string, subject: string, html: string, attachments?: Attachment[]) {
  if (!env("RESEND_API_KEY")) throw new Error("RESEND_API_KEY 미설정");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject, html, attachments }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function appendSheet(o: Order) {
  if (!env("GOOGLE_SHEET_WEBHOOK")) return;
  const res = await fetch(env("GOOGLE_SHEET_WEBHOOK"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(o),
  });
  if (!res.ok) console.error("Google Sheet 실패", res.status);
}

type Product = { title: string; grade: string | null; subject: string | null; file_path: string | null };

// '고1 영어 · 패키지명' (학년/과목이 없으면 패키지명만)
const productLabel = (p: Product) => [[p.grade, p.subject].filter(Boolean).join(" "), p.title].filter(Boolean).join(" · ");
const safeFileName = (p: Product) => `${productLabel(p).replace(/[\\/:*?"<>|]/g, "")}.pdf`;

type DeliverResult = { ok: boolean; error?: string; url?: string; expiresAt?: string };

// 승인된 주문의 PDF 를 받는 방법에 맞게 전달하고 결과를 orders 에 기록
async function deliverPdf(orderNo: string): Promise<DeliverResult> {
  const { data: o, error } = await db
    .from("orders")
    .select("order_no, buyer_name, email, instagram_id, delivery_method, status, products(title, grade, subject, file_path)")
    .eq("order_no", orderNo)
    .single();
  if (error || !o) return { ok: false, error: "주문을 찾을 수 없음" };
  if (o.status !== "APPROVED") return { ok: false, error: "승인되지 않은 주문" };

  // deno-lint-ignore no-explicit-any
  const product = o.products as any as Product;
  if (!product.file_path) {
    const msg = "이 패키지에 풀버전 PDF가 업로드되지 않았습니다";
    await db.from("orders").update({ delivery_error: msg }).eq("order_no", orderNo);
    return { ok: false, error: msg };
  }
  return o.delivery_method === "INSTAGRAM"
    ? await issueDownloadLink(orderNo, product)
    : await emailPdf(o.order_no, o.buyer_name, o.email!, product);
}

// INSTAGRAM: 5시간 후 만료되는 다운로드 링크 생성 (DM 은 관리자가 직접 보냄)
async function issueDownloadLink(orderNo: string, product: Product): Promise<DeliverResult> {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(product.file_path!, INSTAGRAM_LINK_TTL, { download: safeFileName(product) });
  if (error || !data) {
    const msg = `링크 생성 실패: ${error?.message ?? product.file_path}`;
    await db.from("orders").update({ delivery_error: msg }).eq("order_no", orderNo);
    return { ok: false, error: msg };
  }
  const expiresAt = new Date(Date.now() + INSTAGRAM_LINK_TTL * 1000).toISOString();
  await db
    .from("orders")
    .update({ download_url: data.signedUrl, download_expires_at: expiresAt, delivered_at: null, delivery_error: null })
    .eq("order_no", orderNo);
  return { ok: true, url: data.signedUrl, expiresAt };
}

// EMAIL: PDF 를 첨부해서 발송
async function emailPdf(
  orderNo: string,
  buyerName: string,
  email: string,
  product: Product,
): Promise<DeliverResult> {
  try {
    const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(product.file_path!);
    if (dlErr || !file) throw new Error(`PDF 파일 없음: ${product.file_path}`);
    const content = encodeBase64(new Uint8Array(await file.arrayBuffer()));

    await sendMail(
      email,
      `[기말고사 문제은행] ${productLabel(product)} 자료를 보내드립니다`,
      `<p>${esc(buyerName)}님, 안녕하세요. 기말고사 문제은행입니다.</p>
       <p>입금이 확인되어 구매하신 자료를 첨부해 보내드립니다.</p>
       <table cellpadding="6" style="border-collapse:collapse">
         <tr><td style="color:#64748b">주문번호</td><td><b>${esc(orderNo)}</b></td></tr>
         <tr><td style="color:#64748b">자료</td><td>${esc(productLabel(product))}</td></tr>
       </table>
       <p>첨부파일이 보이지 않으면 이 메일에 회신해 주세요.</p>
       <p style="color:#94a3b8;font-size:12px">본 자료는 구매하신 분의 개인 학습용으로만 제공됩니다. 무단 공유 및 재판매를 금지합니다.</p>
       <p>시험 잘 보시길 바랍니다. 감사합니다.</p>`,
      [{ filename: safeFileName(product), content }],
    );
    await db.from("orders").update({ delivered_at: new Date().toISOString(), delivery_error: null }).eq("order_no", orderNo);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("PDF 발송 실패", orderNo, msg);
    await db.from("orders").update({ delivery_error: msg.slice(0, 500) }).eq("order_no", orderNo);
    return { ok: false, error: msg };
  }
}

async function isAdminRequest(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return false;
  const { data } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!data;
}

async function handleWebhook(payload: WebhookPayload) {
  const o = payload.record;
  if (payload.table !== "orders" || !o) return;

  if (payload.type === "INSERT") {
    const { data: p } = await db.from("products").select("title, grade, subject, file_path").eq("id", o.product_id).maybeSingle();
    const productName = p ? productLabel(p as Product) : o.product_id;
    await Promise.all([
      sendMail(
        env("ADMIN_EMAIL"),
        `[입금 신청] ${o.buyer_name} · ${won(o.amount)}원 (${METHOD_LABEL[o.payment_method]})`,
        `<h2>새 입금 확인 요청</h2>
         <table cellpadding="6">
           <tr><td>주문번호</td><td><b>${esc(o.order_no)}</b></td></tr>
           <tr><td>입금자명</td><td><b>${esc(o.buyer_name)}</b></td></tr>
           <tr><td>받는 방법</td><td>${
             o.delivery_method === "INSTAGRAM" ? `인스타그램 DM (@${esc(o.instagram_id ?? "")})` : `이메일 (${esc(o.email ?? "")})`
           }</td></tr>
           <tr><td>패키지</td><td>${esc(productName)}</td></tr>
           <tr><td>금액</td><td>${won(o.amount)}원</td></tr>
           <tr><td>방식</td><td>${METHOD_LABEL[o.payment_method]}</td></tr>
         </table>
         <p><a href="${env("SITE_URL")}/admin.html">관리자 페이지에서 확인하기</a></p>`,
      ).catch((e) => console.error("관리자 알림 실패", e)),
      appendSheet(o),
    ]);
    return;
  }

  if (payload.type === "UPDATE" && payload.old_record?.status !== o.status) {
    if (o.status === "APPROVED") {
      await deliverPdf(o.order_no);
    } else if (o.status === "REJECTED" && o.delivery_method === "EMAIL" && o.email) {
      await sendMail(
        o.email,
        `[기말고사 문제은행] 입금 확인 안내`,
        `<p>${esc(o.buyer_name)}님, 안녕하세요. 기말고사 문제은행입니다.</p>
         <p>주문번호 <b>${esc(o.order_no)}</b>에 해당하는 입금 내역을 확인하지 못했습니다.</p>
         <p>입금자명과 금액을 확인하신 뒤 이 메일에 회신해 주시면 다시 확인해 드리겠습니다.</p>`,
      ).catch((e) => console.error("미확인 안내 실패", e));
    }
    await appendSheet(o);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = env("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") === secret) {
    await handleWebhook((await req.json()) as WebhookPayload);
    return new Response("ok");
  }

  if (await isAdminRequest(req)) {
    const body = await req.json().catch(() => ({}));
    if (body.action === "resend" && body.orderNo) {
      const r = await deliverPdf(body.orderNo);
      return json(r, r.ok ? 200 : 400);
    }
    return json({ ok: false, error: "알 수 없는 요청" }, 400);
  }

  return json({ ok: false, error: "unauthorized" }, 401);
});
