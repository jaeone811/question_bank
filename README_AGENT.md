# 에이전트 워커 실행 가이드

API 키 없이 도는 주문 처리 에이전트. 내 PC 에서 전용 크롬 프로필로 인스타그램 웹을 직접 조작해 DM 을 보내고,
문구는 구독 중인 CLI(`claude -p` / `gemini -p`)로 다듬는다. 유료 LLM API, Meta Graph API, 유료 메일 API 는 쓰지 않는다.

## 1. 처음 한 번

```bash
npm install
npx playwright install chromium      # 에이전트 전용 브라우저
npm run agent:login                  # 열린 창에서 인스타그램 로그인 → 터미널에서 Enter
```

로그인 세션은 `.agent-vault/browser-profile` 에 저장된다. 이 폴더는 계정 그 자체이니 공유하거나 git 에 올리면 안 된다 (.gitignore 처리됨).

이메일도 보내려면 Gmail 2단계 인증을 켜고 앱 비밀번호를 만들어 `.env.local` 의 `GMAIL_USER`, `GMAIL_APP_PASSWORD` 에 넣는다.

## 2. 평소 실행

```bash
npm start        # 웹 서버
npm run agent    # 워커 (웹 서버와 같은 폴더에서)
```

워커가 하는 일:

1. 4초마다 DB 를 확인해 새 주문을 감지 → 주문 상태 페이지에 "AI 에이전트가 주문서를 확인했습니다" 표시
2. 개발자 호출: 터미널 벨 + OS 알림 + (설정 시) 텔레그램 봇 / 디스코드 웹훅
3. 구매자에게 접수 안내 발송 (인스타 DM 또는 이메일)
4. `/admin/agent` 에서 **입금 확인 및 발송 승인**을 누르면 5시간짜리 링크를 발급받아 DM / 이메일로 발송하고, 전송 직후 화면을 `.agent-vault/screenshots` 에 증거로 저장
5. 링크가 만료된 주문 정리, 구매자의 재발급 요청 알림

사람이 승인하기 전에는 링크가 만들어지지도, 나가지도 않는다.

## 3. 막혔을 때

| 상황 | 동작 |
| --- | --- |
| 로그인 풀림, 캡차, 2단계 인증 | 작업이 `AWAITING_HUMAN_AUTH` 로 멈추고 알림이 옴. 에이전트 브라우저 창에서 직접 인증하면 이어서 진행 (기본 10분 대기). `AGENT_HEADLESS=true` 면 창이 없으니 실패 처리되고 `npm run agent:login` 안내 |
| 계정을 못 찾음, 비공개·수신 제한 | 주문이 "발송 실패"가 되고 관제 화면에 **메시지 복사 → DM 열기(ig.me) → 보냈음으로 처리** 버튼이 뜸 |
| 이메일 설정 없음 | 이메일 작업만 실패. 인스타로 나갔으면 주문은 발송 완료 |
| 워커가 중간에 죽음 | 진행 중이던 작업은 중복 발송을 피하려고 자동 재시도하지 않고 실패로 표시. 캡처를 보고 "다시 시도" |
| 링크 만료 | 구매자가 `/download/expired` 에서 요청 → 관제 화면에 "재발급 요청" 표시 → **링크 재발급 후 다시 보내기** |

## 4. 문구 작성 (Zero-API 두뇌)

`AGENT_BRAIN=auto` 면 `claude` → `gemini` 순으로 CLI 를 불러 첫 인사 한 문장만 받는다.

- 실행 명령: `claude -p "<요청>" --tools "" --output-format text --no-session-persistence` (도구 전부 끔)
- 자식 프로세스에서 `ANTHROPIC_API_KEY` 류 환경변수를 지워 구독 로그인으로만 돌게 함
- 결과가 한 문장·140자 이내·구매자 이름 포함·링크 없음 조건을 벗어나면 버리고 기본 문구 사용
- 링크, 만료 시각, 횟수 안내는 항상 코드의 템플릿이 넣는다 (LLM 이 바꿀 수 없음)
- CLI 가 없거나 로그인이 안 돼 있으면 조용히 기본 문구로 넘어감. 아예 끄려면 `AGENT_BRAIN=template`

## 5. 다른 AI 에이전트에게 시키기

"관리자 페이지 들어가서 승인된 주문 확인해 줘" 같은 지시를 브라우저 조작형 에이전트가 수행하기 쉽게 관리자 화면에 표식을 넣어 두었다.

| 표식 | 의미 |
| --- | --- |
| `[data-agent-field="admin-password"]`, `[data-agent-action="admin-login"]` | 로그인 |
| `li.order[data-order-number][data-order-status]` | 주문 카드. `aria-label` 에 주문번호·입금자·금액·상태 |
| `[data-agent-action="approve-order"]` | 입금 확인 및 발송 승인 |
| `[data-agent-action="reject-order"]` → `confirm-reject-order` | 입금 미확인 (2단계) |
| `[data-agent-action="reissue-link"]`, `retry-task`, `mark-delivered` | 재발급, 재시도, 직접 발송 처리 |
| `[data-agent-action="copy-dm-message"]`, `open-instagram-dm` | 수동 발송 보조 |
| `[data-agent-state="worker"]`, `[data-agent-state="auth"]` | 워커·세션 상태 |

승인은 실제 입금을 확인한 사람이 누르는 것이 원칙이다. 다른 에이전트에게 승인까지 맡기면 입금 확인 없이 자료가 나갈 수 있다.

## 6. 꼭 알아둘 한계

- **인스타그램 자동화는 약관 위반 소지가 있다.** 자동 DM 은 계정 제한이나 정지로 이어질 수 있다. DM 간격(기본 45초), 사람 같은 입력 지연을 넣었지만 위험이 없어지지는 않는다. 판매용 부계정 사용을 권한다.
- **실제 인스타그램 화면에서는 아직 검증하지 못했다.** 자동 검증은 같은 흐름을 흉내 낸 가짜 화면(`scripts/mock-instagram.ts`)으로 했다. 인스타가 화면을 바꾸면 `agent-worker/selectors.ts` 만 고치면 된다. 첫 실행 때는 본인 부계정으로 주문을 넣어 시험해 볼 것.
- 처음 대화하는 상대에게 보낸 DM 은 "메시지 요청함"으로 들어간다. 주문서에 안내 문구가 있다.
- 웹메일 화면 자동화 대신 Gmail SMTP(앱 비밀번호)를 쓴다. 더 안정적이고 무료다.
- 워커와 웹 서버는 같은 PC, 같은 폴더에서 돌아야 한다 (SQLite 파일 공유).
