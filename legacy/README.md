# 기말고사 문제은행

내신 변형 문제 PDF 판매 사이트. 무료 샘플 미리보기 → 송금(카카오페이 / 계좌이체 / 토스) → 입금 확인 요청 → 관리자 승인 → 이메일로 PDF 첨부 발송 또는 인스타그램 DM용 5시간 다운로드 링크 발급.

```
index.html                         # 프론트 (단일 파일, Tailwind CDN + Vanilla JS)
admin.html                         # 관리자 페이지 (주문 승인 · 패키지 등록/수정 · PDF 업로드)
samples/                           # Supabase 미연동 시 쓰는 샘플 PDF (연동하면 관리자 페이지에서 업로드)
supabase/schema.sql                # 테이블 · RLS · RPC · Storage 버킷/정책
supabase/webhooks.sql              # 주문 INSERT/UPDATE → notify-order 호출 트리거
supabase/functions/notify-order    # 관리자 알림 · PDF 첨부 메일 · 인스타용 다운로드 링크 · 재발송 · 구글 시트
integrations/google-sheet.gs       # (선택) 구글 시트 Apps Script
```

## 1. 프론트만 쓰기 (백엔드 없이)

`index.html` 상단 `CONFIG` 수정하고 아무 정적 호스팅(GitHub Pages, Netlify 등)에 올리면 끝.
주문은 LocalStorage 에만 저장됨 (`qb_orders_v1`). 이 모드에선 주문이 관리자에게 전달되지 않으니 입금 확인·PDF 발송은 직접 해야 함.

- `kakaoPayLink`: 카카오페이 송금코드 링크 (`https://qr.kakaopay.com/...`) — PC 에선 QR 로 표시
- `tossLink`: 토스아이디 링크 (`https://toss.me/아이디`) — PC 에선 QR 로 표시
- `instagramId`: 다운로드 링크를 DM 으로 보낼 판매자 인스타 아이디
- `bank`: 은행명 / 계좌번호 / 예금주
- `PRODUCTS`: 기본 패키지 목록, `samples/` 에 샘플 PDF (Supabase 연동하면 무시되고 DB 패키지를 불러옴)

## 2. Supabase 붙이기

1. 프로젝트 생성 → **SQL Editor** 에서 `supabase/schema.sql` 실행
2. **Authentication > Users** 에서 관리자 계정 생성 후
   `insert into public.admins (user_id) values ('<UUID>');`
3. Edge Function 배포
   ```bash
   supabase secrets set WEBHOOK_SECRET=<랜덤문자열> RESEND_API_KEY=re_xxx \
     ADMIN_EMAIL=me@example.com MAIL_FROM="기말고사 문제은행 <noreply@yourdomain.com>" \
     SITE_URL=https://your-site.com
   # (선택) GOOGLE_SHEET_WEBHOOK=<Apps Script /exec URL>, ALLOWED_ORIGIN=https://your-site.com
   supabase functions deploy notify-order --no-verify-jwt
   ```
4. **Database > Webhooks** 활성화 후 `supabase/webhooks.sql` 의 `<PROJECT_REF>`, `<WEBHOOK_SECRET>` 채워서 실행 (또는 대시보드 GUI 로 동일하게 생성)
5. `index.html` 의 `CONFIG.supabase`, `admin.html` 상단에 Project URL / anon key 입력
6. `admin.html` > **패키지 관리** 에서 패키지를 만들고 풀버전·샘플 PDF 업로드
   (schema.sql 이 고2 예시 패키지 3개를 넣어두는데, 풀버전을 올리기 전까진 사이트에 안 보임. 필요 없으면 삭제)

## 패키지 관리

| 항목 | 설명 |
| --- | --- |
| 패키지 이름 · 과목 | 사이트 카드와 메일에 `영어 · 패키지 이름` 형태로 표시 (고2 전용이라 학년 구분 없음) |
| 가격 · 설명 · 표시 순서 | 카드에 표시. 주문 금액은 서버가 이 가격으로 계산 |
| 문항 수 | PDF 의 실제 문항 수. 카드에 표시 (비워두면 안 보임) |
| 판매 중 | 끄면 사이트에서 숨김 (기존 주문은 그대로) |
| 풀버전 PDF | 비공개 버킷 `products/<패키지ID>/full-<시각>.pdf`. **업로드돼야 사이트에 표시되고 주문 가능**. 상단 'PDF 자료' 개수에 반영 |
| 무료 샘플 PDF | 공개 버킷 `samples/<패키지ID>/sample-<시각>.pdf`. 없으면 카드에 "샘플 준비 중". 상단 '무료 샘플' 개수에 반영 |

- 파일을 교체하면 새 경로로 올린 뒤 이전 파일을 지움 (샘플 캐시 꼬임 방지)
- 업로드 한도: Supabase 무료 플랜 파일당 50MB. 이메일 첨부는 원본 약 30MB 까지라 그보다 크면 경고
- 주문이 들어온 패키지는 삭제 불가 → 판매 중지로 처리

## 흐름

| 단계 | 처리 |
| --- | --- |
| 주문 | `create_order` RPC — 금액은 서버가 `products.price` 로 재계산, 주문번호 서버 발급 |
| 알림 | INSERT 웹훅 → `notify-order` → 관리자 메일 (+ 구글 시트) |
| 승인 (이메일) | `admin.html` 에서 승인 → UPDATE 웹훅 → `notify-order` 가 비공개 버킷에서 PDF 를 꺼내 구매자 이메일로 첨부 발송. 성공 시 `delivered_at`, 실패 시 `delivery_error` 기록, "PDF 메일 재발송" 가능 |
| 승인 (인스타) | 같은 웹훅에서 5시간 후 만료되는 Signed URL 발급 → `download_url` 저장 → 관리자 페이지에서 "DM 문구 복사" → "DM 열기"로 직접 전송 → "DM 보냄 체크". 만료되면 "링크 재발급" |

보안 메모
- `orders` 는 anon 이 직접 select/insert 못 함. RPC(security definer)로만 접근.
- 상태 조회는 **주문번호 + 이메일** 둘 다 일치해야 함.
- 풀버전 PDF 는 비공개 버킷에만 있고, 관리자가 승인한 주문에만 Edge Function 이 첨부해서 보냄.
- Resend 는 메일 한 통당 40MB(첨부 base64 인코딩 후 기준) 제한 → PDF 는 대략 30MB 이하로 유지.
- 재발송·링크 재발급은 관리자 로그인 토큰으로만 호출 가능 (`admins` 테이블 확인).
- 인스타 DM 자동 발송은 안 함: Instagram Messaging API 는 프로페셔널 계정 + Meta 앱 심사가 필요하고, 상대가 먼저 DM 을 보낸 경우에만 답장 가능. 그래서 관리자가 직접 보냄.
- Signed URL 은 만료 전까지 누구나 열 수 있음 (5시간 동안 공유되면 같이 받을 수 있음).
- 송금 자동 확인은 없음 (개인 계좌 API 없음). 관리자가 입금 내역 보고 수동 승인.
