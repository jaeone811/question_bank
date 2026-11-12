# 기말고사 문제은행

고2 내신 변형 문제 PDF 판매 사이트. 구매자 화면과 관리자 화면이 한 사이트(Next.js 앱 하나)에 들어 있고,
외부 유료 서비스 없이 로컬 SQLite 와 로컬 에이전트 워커만으로 돌아간다.

```
샘플 확인 → 송금 + 주문서 → 에이전트가 접수 알림 → 관리자 승인 → 5시간 링크 발송 → 워터마크 PDF 다운로드
```

## 빠른 시작

```bash
npm install
cp .env.example .env.local      # ADMIN_PASSWORD, 계좌 정보 등 입력
npm run db:seed                 # 예시 패키지 3개 (원본을 올리기 전엔 사이트에 안 보임)
npm run build && npm start      # http://localhost:3000
npm run agent                   # 다른 터미널에서. 자세한 내용은 README_AGENT.md
```

화면만 먼저 보고 싶으면 `npm run seed:demo` 로 예시 PDF 를 채울 수 있다 (실제 자료 아님).

## 화면

| 주소 | 내용 |
| --- | --- |
| `/` | 자료 목록, 샘플 미리보기, 주문서(계좌이체·카카오페이·토스) |
| `/orders`, `/orders/{주문번호}` | 주문 조회, 실시간 진행 상황 |
| `/download/expired` | 링크 만료 안내, 재발급 요청 |
| `/admin/agent` | 주문 승인, 에이전트 상태·브라우저 화면·작업 기록 |
| `/admin/products` | 패키지 등록·수정, 원본/샘플 업로드 |

관리자 메뉴는 로그인하면 같은 헤더에 나타난다. 로그인은 화면 맨 아래 "관리자" 링크.

## 구조

```
src/app            페이지와 API (Next.js App Router)
src/components     화면 컴포넌트
src/lib            주문·토큰·PDF 워터마크·검증 로직 (웹과 워커가 같이 씀)
src/db, drizzle/   Drizzle 스키마와 마이그레이션 (data/app.db, 첫 실행 때 자동 적용)
agent-worker/      자율 에이전트 워커 (README_AGENT.md)
storage/private/questions   원본 파일 (비공개, 게이트웨이로만 나감)
storage/samples             샘플 PDF (공개)
scripts/           시드, 검증 스크립트
legacy/            이전 버전 (정적 HTML + Supabase). 참고용으로 보존
```

## 다운로드 보안

- 주소: `/api/download/{token}`. 토큰은 `랜덤.만료초.HMAC-SHA256서명`, DB(`download_tokens`)에는 SHA-256 해시만 저장
- 승인 시각 + 5시간(18,000초) 뒤 만료, 기본 3회 제한(횟수 차감은 원자적 UPDATE), 재발급하면 이전 링크 폐기
- PDF 는 내려보내기 직전에 모든 쪽에 `구매자명 · 연락처 · 주문번호 · 다운로드 일시` 워터마크를 찍음
- HWP·ZIP 은 워터마크 없이 그대로 나감 (형식상 불가)
- 워터마크는 억제 수단이지 복제 방지 장치가 아님. 화면 캡처나 재편집까지 막지는 못함

## 운영 메모

- 서버가 꺼져 있으면 구매자가 링크를 못 연다. 집 PC 에서 돌리면 `SITE_URL` 을 외부에서 접속되는 주소(터널이나 도메인)로 맞춰야 함
- 주문 금액은 서버가 패키지 가격으로 계산. 주문 접수·로그인·다운로드에는 IP 기준 요청 제한이 있음
- 백업할 것: `data/`, `storage/`, `.agent-vault/`

## 검증

```bash
npm run typecheck
npm run build && npm start &          # 서버 실행
npm run seed:demo && npm run verify   # 가짜 인스타 화면으로 전 과정 자동 검증
```
