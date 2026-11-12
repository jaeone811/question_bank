# 기말고사 문제은행 (Next.js + Supabase + 피클 AI)

고2 내신 변형 문제 PDF 판매 사이트입니다.
집 PC를 켜둘 필요 없이 **Supabase(DB + 파일 스토리지)** 와 **Vercel(무료 서버리스 호스팅)** 및 **피클 AI(인스타그램 DM 운영)** 로 24시간 돌아갑니다.

```
샘플 2쪽 확인 → 송금 + 주문서 제출 → 관리자 승인 → 5시간 보안 링크 발급 → 구매자 워터마크 PDF 다운로드
```

## 핵심 기능

1. **구매자 스토어 (`/`, `/orders`, `/download/expired`)**
   - 자료별 앞 2쪽 샘플 미리보기 (원본 업로드 시 자동 생성)
   - 계좌이체 · 카카오페이 · 토스 QR 송금 안내 및 주문서 접수
   - 실시간 주문 진행 상황 조회 및 만료 링크 재발급 요청
2. **관리자 콘솔 (`/admin/products`, `/admin/agent`)**
   - 패키지 등록·수정 및 원본/샘플 PDF 업로드 (Supabase Storage 자동 연동)
   - 입금 확인 후 1클릭 승인 → **5시간 유효 · 최대 3회 다운로드** 보안 링크 발급
   - 인스타그램(피클 AI) 전달용 **링크 복사 / 전체 안내 문구 복사** 및 이메일 자동 발송
3. **실시간 워터마크 보안 게이트웨이 (`/api/download/[token]`)**
   - 다운로드 직전에 PDF 모든 페이지에 `구매자 성함 · 연락처 · 주문번호 · 다운로드 일시` 워터마크 삽입
4. **피클 AI 연동 API (`/api/pickle/order`)**
   - `GET /api/pickle/order?orderNumber=QB-...` (또는 `?instagram=아이디`, `?phone=010...`)로 구매자 주문 상태와 5시간 다운로드 링크 및 안내 문구를 즉시 조회 가능
   - `PICKLE_WEBHOOK_URL` 설정 시 주문 접수/승인/재발급 이벤트 자동 전송

## 빠른 시작

1. **Supabase 스키마 생성**: Supabase Dashboard > SQL Editor에 `supabase/schema.sql` 내용을 붙여넣고 실행합니다.
2. **환경변수 설정**: `.env.example`을 복사해 `.env.local`을 만들고 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, 계좌 정보 등을 채웁니다.
3. **실행**:
   ```bash
   npm install
   npm run dev
   ```
