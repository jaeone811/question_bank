// notify-order
// orders 테이블 Database Webhook 수신 →
//   INSERT            : 관리자에게 새 입금 신청 메일 + (선택) 구글 시트 행 추가
//   UPDATE → APPROVED : 구매자에게 승인 메일 (사이트 다운로드 링크 안내)
//   UPDATE → REJECTED : 구매자에게 확인 불가 메일
//
// 배포: supabase functions deploy notify-order --no-verify-jwt
// 시크릿:
//   supabase secrets set WEBHOOK_SECRET=... RESEND_API_KEY=re_... \
//     ADMIN_EMAIL=me@example.com MAIL_FROM="문제은행 <noreply@yourdomain.com>" \
//     SITE_URL=https://your-site.com GOOGLE_SHEET_WEBHOOK=https://script.google.com/macros/s/.../exec

type Order = {
  order_no: string;
  buyer_name: string;
  email: string;
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

const env = (k: string) => Deno.env.get(k) ?? "";
const METHOD_LABEL = { KAKAOPAY: "카카오페이", BANK: "계좌이체", TOSS: "토스/기타" };
const won = (n: number) => n.toLocaleString("ko-KR");
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function sendMail(to: string, subject: string, html: string) {
  if (!env("RESEND_API_KEY")) return console.warn("RESEND_API_KEY 없음, 메일 스킵");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject, html }),
  });
  if (!res.ok) console.error("Resend 실패", res.status, await res.text());
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

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET") || !env("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const payload = (await req.json()) as WebhookPayload;
  const o = payload.record;
  if (payload.table !== "orders" || !o) return new Response("ignored");

  if (payload.type === "INSERT") {
    await Promise.all([
      sendMail(
        env("ADMIN_EMAIL"),
        `[입금 신청] ${o.buyer_name} · ${won(o.amount)}원 (${METHOD_LABEL[o.payment_method]})`,
        `<h2>새 입금 확인 요청</h2>
         <table cellpadding="6">
           <tr><td>주문번호</td><td><b>${esc(o.order_no)}</b></td></tr>
           <tr><td>입금자명</td><td><b>${esc(o.buyer_name)}</b></td></tr>
           <tr><td>이메일</td><td>${esc(o.email)}</td></tr>
           <tr><td>상품</td><td>${esc(o.product_id)}</td></tr>
           <tr><td>금액</td><td>${won(o.amount)}원</td></tr>
           <tr><td>방식</td><td>${METHOD_LABEL[o.payment_method]}</td></tr>
         </table>
         <p><a href="${env("SITE_URL")}/admin.html">관리자 페이지에서 승인하기 →</a></p>`,
      ),
      appendSheet(o),
    ]);
  }

  if (payload.type === "UPDATE" && payload.old_record?.status !== o.status) {
    const link = `${env("SITE_URL")}/?order=${encodeURIComponent(o.order_no)}`;
    if (o.status === "APPROVED") {
      await sendMail(
        o.email,
        `[기말고사 문제은행] 입금 확인 완료 - 풀버전 PDF 받아가세요`,
        `<p>${esc(o.buyer_name)}님, 입금이 확인됐어요! 🎉</p>
         <p>주문번호 <b>${esc(o.order_no)}</b></p>
         <p><a href="${link}">여기를 눌러 '내 주문 내역'에서 다운로드</a></p>
         <p style="color:#888;font-size:12px">주문했던 브라우저에서 열어야 내역이 보여요. 다운로드 링크는 발급 후 5분간 유효합니다.</p>`,
      );
    } else if (o.status === "REJECTED") {
      await sendMail(
        o.email,
        `[기말고사 문제은행] 입금 확인이 어려워요`,
        `<p>${esc(o.buyer_name)}님, 주문번호 <b>${esc(o.order_no)}</b>의 입금 내역을 찾지 못했어요.</p>
         <p>입금자명·금액을 확인 후 이 메일에 답장 주세요.</p>`,
      );
    }
    if (env("GOOGLE_SHEET_WEBHOOK")) await appendSheet(o);
  }

  return new Response("ok");
});
