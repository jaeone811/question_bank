"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst, won } from "@/lib/format";
import type { AdminOverview } from "@/lib/orders";

type O = AdminOverview["orders"][number];
type Task = O["tasks"][number];

const METHOD = { BANK: "계좌이체", KAKAOPAY: "카카오페이", TOSS: "토스" } as const;
const STATUS: Record<O["status"], { label: string; tone: "wait" | "ok" | "bad" | "idle" }> = {
  PENDING_VERIFICATION: { label: "입금 확인 대기", tone: "wait" },
  NOTIFIED_USER: { label: "접수 안내 완료, 입금 확인 대기", tone: "wait" },
  APPROVED: { label: "승인됨, 발송 대기", tone: "ok" },
  DISPATCHING: { label: "발송 중", tone: "ok" },
  DELIVERED: { label: "발송 완료", tone: "ok" },
  DISPATCH_FAILED: { label: "발송 실패", tone: "bad" },
  EXPIRED: { label: "링크 만료", tone: "idle" },
  REJECTED: { label: "입금 미확인", tone: "bad" },
};
const TASK_STATUS: Record<Task["status"], string> = {
  QUEUED: "대기",
  RUNNING: "진행 중",
  AWAITING_HUMAN_AUTH: "사람 인증 대기",
  COMPLETED: "완료",
  FAILED: "실패",
  SKIPPED: "건너뜀",
};
const TABS = [
  { id: "todo", label: "확인 대기", match: (o: O) => ["PENDING_VERIFICATION", "NOTIFIED_USER"].includes(o.status) || !!o.reissueRequestedAt },
  { id: "sending", label: "발송 중·실패", match: (o: O) => ["APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(o.status) },
  { id: "done", label: "완료", match: (o: O) => ["DELIVERED", "EXPIRED", "REJECTED"].includes(o.status) },
  { id: "all", label: "전체", match: () => true },
] as const;

export function AgentConsole({ initial, emailReady }: { initial: AdminOverview; emailReady: boolean }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (res.status === 401) return void (window.location.href = "/admin/login");
    if (res.ok) setData((await res.json()).data);
  }, []);

  useEffect(() => {
    const t = setInterval(() => !document.hidden && void refresh(), 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = async (key: string, url: string, okText: string) => {
    setBusy(key);
    setFlash(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      setFlash(res.ok ? { tone: "ok", text: okText } : { tone: "bad", text: json.error ?? "처리하지 못했습니다." });
      await refresh();
    } catch {
      setFlash({ tone: "bad", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setBusy(null);
    }
  };

  const beat = Number(data.state.heartbeat?.value ?? 0);
  const online = data.now - beat < 20_000;
  const auth = data.state.auth?.value ?? "UNKNOWN";
  const liveAt = Number(data.state.live_at?.value ?? 0);
  const shown = data.orders.filter(TABS.find((t) => t.id === tab)!.match);

  return (
    <div className="console">
      <div className="console__main">
        <div className="console__head">
          <div>
            <p className="eyebrow">관리자</p>
            <h1>주문·에이전트 관제</h1>
          </div>
          <div className="tabs" role="tablist" aria-label="주문 분류">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-agent-action={`filter-${t.id}`} onClick={() => setTab(t.id)}>
                {t.label} <span className="num">{data.orders.filter(t.match).length}</span>
              </button>
            ))}
          </div>
        </div>

        {flash ? <p className={`notice notice--${flash.tone}`} role="status">{flash.text}</p> : null}
        {!emailReady ? <p className="notice">이메일 발송 설정(GMAIL_USER, GMAIL_APP_PASSWORD)이 없어 이메일 주문은 자동 발송되지 않습니다.</p> : null}

        <ul className="orders" aria-label="주문 목록">
          {shown.map((o) => (
            <OrderCard key={o.id} o={o} busy={busy} act={act} onShot={setShot} now={data.now} />
          ))}
          {shown.length === 0 ? <li className="orders__none">이 분류에 해당하는 주문이 없습니다.</li> : null}
        </ul>
      </div>

      <aside className="console__side" aria-label="에이전트 상태">
        <div className="panel">
          <h2>에이전트</h2>
          <dl className="kv">
            <div><dt>워커</dt><dd data-agent-state="worker" data-tone={online ? "ok" : "bad"}>{online ? "실행 중" : beat ? `응답 없음 (마지막 ${formatKst(beat)})` : "실행된 적 없음"}</dd></div>
            <div><dt>인스타그램 세션</dt><dd data-agent-state="auth" data-tone={auth === "OK" ? "ok" : auth === "AWAITING_HUMAN_AUTH" ? "wait" : "idle"}>{auth === "OK" ? "로그인됨" : auth === "AWAITING_HUMAN_AUTH" ? "사람 인증 필요" : "확인 전"}</dd></div>
            <div><dt>문구 작성</dt><dd>{data.state.brain?.value ?? "미정"}</dd></div>
          </dl>
          {!online ? <p className="panel__hint">터미널에서 <code>npm run agent</code>를 실행하면 접수 알림과 링크 발송이 자동으로 진행됩니다.</p> : null}
          {auth === "AWAITING_HUMAN_AUTH" ? <p className="notice notice--wait">에이전트 브라우저 창에서 로그인 또는 추가 인증을 직접 완료해 주세요. 끝나면 작업이 이어집니다.</p> : null}
        </div>

        <div className="panel">
          <h2>브라우저 화면</h2>
          {liveAt ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="live" src={`/api/admin/screenshots/live.jpg?t=${liveAt}`} alt="에이전트 브라우저의 최근 화면" />
              <p className="panel__hint num">{formatKst(liveAt)} 캡처</p>
            </>
          ) : (
            <p className="panel__hint">에이전트가 브라우저를 열면 이곳에 화면이 표시됩니다.</p>
          )}
        </div>

        <div className="panel">
          <h2>작업 기록</h2>
          <ol className="log" aria-live="polite">
            {data.logs.map((l) => (
              <li key={l.id} data-level={l.level}>
                <time className="num">{formatKst(l.createdAt).slice(-5)}</time>
                <span>{l.message}</span>
                {l.screenshotPath ? <button type="button" className="link" onClick={() => setShot(l.screenshotPath)}>캡처</button> : null}
              </li>
            ))}
            {data.logs.length === 0 ? <li>아직 기록이 없습니다.</li> : null}
          </ol>
        </div>
      </aside>

      {shot ? (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShot(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="전송 증거 캡처">
            <header className="modal__head">
              <h2>전송 증거 캡처</h2>
              <button type="button" className="icon-btn" onClick={() => setShot(null)}>닫기</button>
            </header>
            <div className="modal__body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="live" src={`/api/admin/screenshots/${shot}`} alt="에이전트가 메시지를 보낸 직후의 화면" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderCard({ o, busy, act, onShot, now }: { o: O; busy: string | null; act: (k: string, u: string, t: string) => void; onShot: (s: string) => void; now: number }) {
  const [confirmReject, setConfirmReject] = useState(false);
  const [copied, setCopied] = useState(false);
  const s = STATUS[o.status];
  const pending = ["PENDING_VERIFICATION", "NOTIFIED_USER"].includes(o.status);
  const sending = ["APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(o.status);
  const reissuable = ["DELIVERED", "DISPATCH_FAILED", "EXPIRED", "APPROVED"].includes(o.status);
  const failedIg = sending && o.tasks.find((t) => t.taskType === "SEND_DOWNLOAD_LINK" && t.targetChannel === "INSTAGRAM" && t.status === "FAILED" && t.message);
  const base = `/api/admin/orders/${o.id}`;
  const expired = o.token && now >= o.token.expiresAt;

  return (
    <li className="order" data-order-number={o.orderNumber} data-order-status={o.status} aria-label={`주문 ${o.orderNumber}, 입금자 ${o.depositorName}, ${won(o.totalAmount)}원, ${s.label}`}>
      <div className="order__top">
        <span className="badge" data-tone={s.tone}>{s.label}</span>
        {o.reissueRequestedAt ? <span className="badge" data-tone="wait">재발급 요청</span> : null}
        <span className="num order__no">{o.orderNumber}</span>
        <time className="num order__time">{formatKst(o.createdAt)}</time>
      </div>

      <div className="order__body">
        <div className="order__deposit">
          <span>입금자명</span>
          <b>{o.depositorName}</b>
          <span className="num order__amount">{won(o.totalAmount)}원</span>
          <span>{METHOD[o.paymentMethod]}</span>
        </div>
        <dl className="kv">
          <div><dt>자료</dt><dd>{o.productLabel}</dd></div>
          <div><dt>구매자</dt><dd>{o.buyerName} <span className="num">({o.buyerPhone})</span></dd></div>
          {o.buyerInstagram ? <div><dt>인스타그램</dt><dd className="num">@{o.buyerInstagram}</dd></div> : null}
          {o.buyerEmail ? <div><dt>이메일</dt><dd className="num">{o.buyerEmail}</dd></div> : null}
          {o.token ? (
            <div><dt>링크</dt><dd className="num" data-tone={expired ? "bad" : undefined}>{expired ? "만료됨" : `${formatKst(o.token.expiresAt)}까지`} · {o.token.downloadCount}/{o.token.maxDownloads}회 사용</dd></div>
          ) : null}
        </dl>
      </div>

      {o.tasks.length ? (
        <ul className="tasks" aria-label="에이전트 작업">
          {o.tasks.map((t) => (
            <li key={t.id} data-task-status={t.status}>
              <span className="dot" data-tone={t.status === "COMPLETED" ? "ok" : t.status === "FAILED" ? "bad" : t.status === "SKIPPED" ? "idle" : "wait"} />
              <span>{t.taskType === "SEND_RECEIPT_ACK" ? "접수 안내" : "링크 발송"} · {t.targetChannel === "INSTAGRAM" ? "인스타그램 DM" : "이메일"}</span>
              <b>{TASK_STATUS[t.status]}</b>
              {t.errorMessage && t.status !== "SKIPPED" ? <em>{t.errorMessage}</em> : null}
              {t.screenshotPath ? <button type="button" className="link" onClick={() => onShot(t.screenshotPath!)}>캡처 보기</button> : null}
              {t.status === "FAILED" ? (
                <button type="button" className="link" data-agent-action="retry-task" aria-label={`주문 ${o.orderNumber} 실패한 작업 다시 시도`} disabled={busy !== null} onClick={() => act(t.id, `/api/admin/tasks/${t.id}/retry`, "작업을 다시 대기열에 넣었습니다.")}>
                  다시 시도
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {failedIg ? (
        <div className="fallback" role="group" aria-label="인스타그램 직접 보내기">
          <p>자동 전송이 막혔습니다. 아래 순서로 직접 보내 주세요.</p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            data-agent-action="copy-dm-message"
            onClick={async () => {
              await navigator.clipboard.writeText(failedIg.message ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "복사했습니다" : "1. 메시지 복사"}
          </button>
          <a className="btn btn--ghost btn--sm" data-agent-action="open-instagram-dm" href={`https://ig.me/m/${o.buyerInstagram}`} target="_blank" rel="noopener">2. DM 열기</a>
          <button type="button" className="btn btn--ghost btn--sm" data-agent-action="mark-delivered" aria-label={`주문 ${o.orderNumber} 직접 발송 완료 처리`} disabled={busy !== null} onClick={() => act(o.id, `${base}/mark-delivered`, "발송 완료로 처리했습니다.")}>
            3. 보냈음으로 처리
          </button>
        </div>
      ) : null}

      <div className="order__actions">
        {pending ? (
          <>
            <button type="button" className="btn btn--primary" data-agent-action="approve-order" aria-label={`주문 ${o.orderNumber} 입금 확인 및 발송 승인`} disabled={busy !== null} onClick={() => act(o.id, `${base}/approve`, `${o.orderNumber} 주문을 승인했습니다. 5시간짜리 링크를 발송합니다.`)}>
              {busy === o.id ? "처리하고 있습니다" : "입금 확인 및 발송 승인"}
            </button>
            {confirmReject ? (
              <button type="button" className="btn btn--danger" data-agent-action="confirm-reject-order" aria-label={`주문 ${o.orderNumber} 입금 미확인 처리 확정`} disabled={busy !== null} onClick={() => act(o.id, `${base}/reject`, "입금 미확인으로 처리했습니다.")}>
                미확인 처리 확정
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" data-agent-action="reject-order" aria-label={`주문 ${o.orderNumber} 입금 미확인 처리`} onClick={() => setConfirmReject(true)}>
                입금 미확인
              </button>
            )}
          </>
        ) : null}
        {reissuable ? (
          <button type="button" className={o.reissueRequestedAt ? "btn btn--primary" : "btn btn--ghost"} data-agent-action="reissue-link" aria-label={`주문 ${o.orderNumber} 다운로드 링크 재발급 후 다시 보내기`} disabled={busy !== null} onClick={() => act(o.id, `${base}/reissue`, "새 링크를 발급했습니다. 다시 발송합니다.")}>
            링크 재발급 후 다시 보내기
          </button>
        ) : null}
        {sending && !failedIg ? (
          <button type="button" className="btn btn--ghost" data-agent-action="mark-delivered" aria-label={`주문 ${o.orderNumber} 직접 발송 완료 처리`} disabled={busy !== null} onClick={() => act(o.id, `${base}/mark-delivered`, "발송 완료로 처리했습니다.")}>
            직접 보냈음으로 처리
          </button>
        ) : null}
      </div>
    </li>
  );
}
