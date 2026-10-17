# 기말고사 문제은행

내신 변형 문제 PDF 판매 사이트. 무료 샘플 미리보기 → 송금(카카오페이 / 계좌이체 / 토스) → 입금 확인 요청 → 관리자 승인 → 구매자 이메일로 풀버전 PDF 첨부 발송.

```
index.html                         # 프론트 (단일 파일, Tailwind CDN + Vanilla JS)
admin.html                         # 관리자 승인 페이지
samples/                           # 무료 샘플 PDF (공개)
supabase/schema.sql                # 테이블 · RLS · RPC · 비공개 버킷
supabase/webhooks.sql              # 주문 INSERT/UPDATE → notify-order 호출 트리거
supabase/functions/notify-order    # 관리자 알림 · 승인 시 PDF 첨부 메일 발송 · 재발송 · 구글 시트
integrations/google-sheet.gs       # (선택) 구글 시트 Apps Script
```

## 1. 프론트만 쓰기 (백엔드 없이)

`index.html` 상단 `CONFIG` 수정하고 아무 정적 호스팅(GitHub Pages, Netlify 등)에 올리면 끝.
주문은 LocalStorage 에만 저장됨 (`qb_orders_v1`). 이 모드에선 주문이 관리자에게 전달되지 않으니 입금 확인·PDF 발송은 직접 해야 함.

- `kakaoPayLink`: 카카오페이 송금코드 링크 (`https://qr.kakaopay.com/...`)
- `tossLink`: 토스아이디 링크 (`https://toss.me/아이디`)
- `bank`: 은행명 / 계좌번호 / 예금주
- `PRODUCTS`: 상품 목록, `samples/` 에 샘플 PDF

## 2. Supabase 붙이기

1. 프로젝트 생성 → **SQL Editor** 에서 `supabase/schema.sql` 실행
2. **Storage > products**(비공개 버킷)에 풀버전 PDF 업로드 — 경로는 `products.file_path` 와 동일 (예: `h1-eng/full.pdf`)
3. **Authentication > Users** 에서 관리자 계정 생성 후
   `insert into public.admins (user_id) values ('<UUID>');`
4. Edge Function 배포
   ```bash
   supabase secrets set WEBHOOK_SECRET=<랜덤문자열> RESEND_API_KEY=re_xxx \
     ADMIN_EMAIL=me@example.com MAIL_FROM="기말고사 문제은행 <noreply@yourdomain.com>" \
     SITE_URL=https://your-site.com
   # (선택) GOOGLE_SHEET_WEBHOOK=<Apps Script /exec URL>, ALLOWED_ORIGIN=https://your-site.com
   supabase functions deploy notify-order --no-verify-jwt
   ```
5. **Database > Webhooks** 활성화 후 `supabase/webhooks.sql` 의 `<PROJECT_REF>`, `<WEBHOOK_SECRET>` 채워서 실행 (또는 대시보드 GUI 로 동일하게 생성)
6. `index.html` 의 `CONFIG.supabase`, `admin.html` 상단에 Project URL / anon key 입력

## 흐름

| 단계 | 처리 |
| --- | --- |
| 주문 | `create_order` RPC — 금액은 서버가 `products.price` 로 재계산, 주문번호 서버 발급 |
| 알림 | INSERT 웹훅 → `notify-order` → 관리자 메일 (+ 구글 시트) |
| 승인 | `admin.html` 에서 승인 → UPDATE 웹훅 → `notify-order` 가 비공개 버킷에서 PDF 를 꺼내 구매자 이메일로 첨부 발송 |
| 결과 | 발송 성공 시 `delivered_at`, 실패 시 `delivery_error` 기록 → 관리자 페이지에 표시, "PDF 메일 재발송" 버튼으로 다시 보낼 수 있음 |

보안 메모
- `orders` 는 anon 이 직접 select/insert 못 함. RPC(security definer)로만 접근.
- 상태 조회는 **주문번호 + 이메일** 둘 다 일치해야 함.
- 풀버전 PDF 는 비공개 버킷에만 있고, 관리자가 승인한 주문에만 Edge Function 이 첨부해서 보냄.
- Resend 는 메일 한 통당 40MB(첨부 base64 인코딩 후 기준) 제한 → PDF 는 대략 30MB 이하로 유지.
- 재발송은 관리자 로그인 토큰으로만 호출 가능 (`admins` 테이블 확인).
- 송금 자동 확인은 없음 (개인 계좌 API 없음). 관리자가 입금 내역 보고 수동 승인.
