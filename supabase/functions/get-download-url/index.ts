// get-download-url
// 브라우저에서 { orderNo, email } 로 호출 → 승인된 주문이면 비공개 버킷 PDF 의 Signed URL 반환
// 발급할 때마다 orders.download_count 가 원자적으로 +1, download_limit 넘으면 거절
//
// 배포: supabase functions deploy get-download-url --no-verify-jwt
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge Function 에 기본 주입됨)

import { createClient } from "npm:@supabase/supabase-js@2";

const SIGNED_URL_TTL = 60 * 5; // 5분
const BUCKET = "products";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let orderNo = "", email = "";
  try {
    ({ orderNo, email } = await req.json());
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  if (!orderNo || !email) return json({ error: "주문번호와 이메일이 필요해요" }, 400);

  const { data, error } = await admin.rpc("claim_download", { p_order_no: orderNo, p_email: email });
  if (error) {
    console.error(error);
    return json({ error: "서버 오류" }, 500);
  }

  const row = data?.[0];
  if (!row) {
    // 원인 구분해서 안내 (승인 전 / 횟수 소진 / 없는 주문)
    const { data: o } = await admin
      .from("orders")
      .select("status, download_count, download_limit")
      .eq("order_no", orderNo)
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (!o) return json({ error: "주문을 찾을 수 없어요" }, 404);
    if (o.status !== "APPROVED") return json({ error: "아직 입금 확인 전이에요" }, 403);
    return json({ error: "다운로드 가능 횟수를 모두 사용했어요. 문의해 주세요" }, 403);
  }

  const fileName = `${orderNo}.pdf`;
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, SIGNED_URL_TTL, { download: fileName });
  if (signErr || !signed) {
    console.error(signErr);
    return json({ error: "파일을 찾을 수 없어요. 관리자에게 문의해 주세요" }, 500);
  }

  return json({ url: signed.signedUrl, expiresIn: SIGNED_URL_TTL, remaining: row.remaining });
});
