# 기말고사 문제은행

내신 변형 문제 PDF 판매 사이트. 무료 샘플 미리보기 → 송금(카카오페이 / 계좌이체 / 토스) → 입금 확인 요청 → 관리자 승인 → Signed URL 로 풀버전 다운로드.

```
index.html                         # 프론트 (단일 파일, Tailwind CDN + Vanilla JS)
admin.html                         # 관리자 승인 페이지
samples/                           # 무료 샘플 PDF (공개)
supabase/schema.sql                # 테이블 · RLS · RPC · 비공개 버킷
supabase/webhooks.sql              # 주문 INSERT/UPDATE → notify-order 호출 트리거
supabase/functions/notify-order    # 관리자 알림 메일 · 구매자 승인 메일 · 구글 시트
supabase/functions/get-download-url# 승인 주문 → Signed URL 발급 (횟수 제한)
integrations/google-sheet.gs       # (선택) 구글 시트 Apps Script
```

## 1. 프론트만 쓰기 (백엔드 없이)

`index.html` 상단 `CONFIG` 수정하고 아무 정적 호스팅(GitHub Pages, Netlify 등)에 올리면 끝.
주문은 LocalStorage 에만 저장됨 (`qb_orders_v1`).

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
     ADMIN_EMAIL=me@example.com MAIL_FROM="문제은행 <noreply@yourdomain.com>" \
     SITE_URL=https://your-site.com
   # (선택) GOOGLE_SHEET_WEBHOOK=<Apps Script /exec URL>, ALLOWED_ORIGIN=https://your-site.com
   supabase functions deploy notify-order --no-verify-jwt
   supabase functions deploy get-download-url --no-verify-jwt
   ```
5. **Database > Webhooks** 활성화 후 `supabase/webhooks.sql` 의 `<PROJECT_REF>`, `<WEBHOOK_SECRET>` 채워서 실행 (또는 대시보드 GUI 로 동일하게 생성)
6. `index.html` 의 `CONFIG.supabase`, `admin.html` 상단에 Project URL / anon key 입력

## 흐름

| 단계 | 처리 |
| --- | --- |
| 주문 | `create_order` RPC — 금액은 서버가 `products.price` 로 재계산, 주문번호 서버 발급 |
| 알림 | INSERT 웹훅 → `notify-order` → 관리자 메일 (+ 구글 시트) |
| 승인 | `admin.html` 에서 APPROVED 로 변경 → UPDATE 웹훅 → 구매자 메일 |
| 다운로드 | `get-download-url` → `claim_download` 로 횟수 차감(기본 3회) → 5분짜리 Signed URL |

보안 메모
- `orders` 는 anon 이 직접 select/insert 못 함. RPC(security definer)로만 접근.
- 상태 조회·다운로드는 **주문번호 + 이메일** 둘 다 일치해야 함.
- Signed URL 자체는 만료 전까지 여러 번 열릴 수 있음 → 짧은 TTL + 발급 횟수 제한으로 "일회성" 보장.
- 송금 자동 확인은 없음 (개인 계좌 API 없음). 관리자가 입금 내역 보고 수동 승인.
