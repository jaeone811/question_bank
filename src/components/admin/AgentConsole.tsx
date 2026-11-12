"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst, won } from "@/lib/format";
import type { AdminOverview } from "@/lib/orders";

type O = AdminOverview["orders"][number];

const METHOD = { BANK: "계좌이체", KAKAOPAY: "카카오페이", TOSS: "토스" } as const;
const STATUS: Record<O["status"], { label: string; tone: "wait" | "ok" | "bad" | "idle" }> = {
  PENDING_VERIFICATION: { label: "입금 확인 대기", tone: "wait" },
  NOTIFIED_USER: { label: "접수 안내 완료, 입금 확인 대기", tone: "wait" },
  APPROVED: { label: "승인됨 · 링크 전달 대기", tone: "ok" },
  DISPATCHING: { label: "발송 중", tone: "ok" },
  DELIVERED: { label: "발송 완료", tone: "ok" },
  DISPATCH_FAILED: { label: "발송 실패", tone: "bad" },
  EXPIRED: { label: "링크 만료", tone: "idle" },
  REJECTED: { label: "입금 미확인", tone: "bad" },
};

const TABS = [
  { id: "todo", label: "확인 대기", match: (o: O) => ["PENDING_VERIFICATION", "NOTIFIED_USER"].includes(o.status) || !!o.reissueRequestedAt },
  { id: "sending", label: "링크 전달 대기", match: (o: O) => ["APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(o.status) },
  { id: "done", label: "완료", match: (o: O) => ["DELIVERED", "EXPIRED", "REJECTED"].includes(o.status) },
  { id: "all", label: "전체", match: () => true },
] as const;

export function AgentConsole({
  initial,
  emailReady,
  pickleWebhookReady,
}: {
  initial: AdminOverview;
  emailReady: boolean;
  pickleWebhookReady: boolean;
}) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (res.status === 401) return void (window.location.href = "/admin/login");
    if (res.ok) setData((await res.json()).data);
  }, []);

  useEffect(() => {
    const t = setInterval(() => !document.hidden && void refresh(), 5000);
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

  const shown = data.orders.filter(TABS.find((t) => t.id === tab)!.match);

  return (
    <div className="console">
      <div className="console__main">
        <div className="console__head">
          <div>
            <p className="eyebrow">관리자</p>
            <h1>주문·발송 관리</h1>
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

        <ul className="orders" aria-label="주문 목록">
          {shown.map((o) => (
            <OrderCard key={o.id} o={o} busy={busy} act={act} now={data.now} />
          ))}
          {shown.length === 0 ? <li className="orders__none">이 분류에 해당하는 주문이 없습니다.</li> : null}
        </ul>
      </div>

      <aside className="console__side" aria-label="연동 및 작업 상태">
        <div className="panel">
          <h2>클라우드·발송 연동</h2>
          <dl className="kv">
            <div><dt>저장소</dt><dd data-tone="ok">Supabase (DB · Storage)</dd></div>
            <div><dt>인스타 운영</dt><dd data-tone="ok">{pickleWebhookReady ? "피클 AI (웹훅 + API)" : "피클 AI (링크 복사 / API 조회)"}</dd></div>
            <div><dt>이메일 발송</dt><dd data-tone={emailReady ? "ok" : "idle"}>{emailReady ? "Gmail 자동 발송 활성" : "수동 링크 전달 (GMAIL 미설정)"}</dd></div>
          </dl>
          <p className="panel__hint">
            주문을 승인하면 <b>5시간 유효 · 구매자 워터마크 적용</b> 다운로드 링크가 즉시 발급됩니다. 피클 AI는 <code>/api/pickle/order</code> API로 링크를 자동 조회하거나, 각 주문 카드에서 1클릭으로 복사해 전달할 수 있습니다.
          </p>
        </div>

        <div className="panel">
          <h2>최근 처리 기록</h2>
          <ol className="log" aria-live="polite">
            {data.logs.map((l) => (
              <li key={l.id} data-level={l.level}>
                <time className="num">{formatKst(l.createdAt).slice(-5)}</time>
                <span>{l.message}</span>
              </li>
            ))}
            {data.logs.length === 0 ? <li>아직 기록이 없습니다.</li> : null}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function OrderCard({ o, busy, act, now }: { o: O; busy: string | null; act: (k: string, u: string, t: string) => void; now: number }) {
  const [confirmReject, setConfirmReject] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const s = STATUS[o.status];
  const pending = ["PENDING_VERIFICATION", "NOTIFIED_USER"].includes(o.status);
  const sending = ["APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(o.status);
  const reissuable = ["DELIVERED", "DISPATCH_FAILED", "EXPIRED", "APPROVED"].includes(o.status);
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
            <div><dt>링크 상태</dt><dd className="num" data-tone={expired ? "bad" : undefined}>{expired ? "만료됨" : `${formatKst(o.token.expiresAt)}까지`} · {o.token.downloadCount}/{o.token.maxDownloads}회 사용</dd></div>
          ) : null}
          {o.emailSentAt ? <div><dt>이메일 발송</dt><dd className="num">{formatKst(o.emailSentAt)} 완료</dd></div> : null}
          {o.emailError ? <div><dt>이메일 안내</dt><dd>{o.emailError}</dd></div> : null}
        </dl>
      </div>

      {o.downloadUrl ? (
        <div className="fallback" role="group" aria-label="다운로드 링크 및 피클 AI / DM 전달">
          <p className="num" style={{ wordBreak: "break-all" }}>보안 링크: {o.downloadUrl}</p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={async () => {
              await navigator.clipboard.writeText(o.downloadUrl ?? "");
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
          >
            {copiedLink ? "링크 복사됨" : "1. 링크만 복사"}
          </button>
          {o.dmMessage ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                await navigator.clipboard.writeText(o.dmMessage ?? "");
                setCopiedMsg(true);
                setTimeout(() => setCopiedMsg(false), 2000);
              }}
            >
              {copiedMsg ? "문구 복사됨" : "2. 전체 안내 문구 복사"}
            </button>
          ) : null}
          {o.buyerInstagram ? (
            <a className="btn btn--ghost btn--sm" href={`https://ig.me/m/${o.buyerInstagram}`} target="_blank" rel="noopener">
              인스타 DM 열기
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="order__actions">
        {pending ? (
          <>
            <button type="button" className="btn btn--primary" data-agent-action="approve-order" aria-label={`주문 ${o.orderNumber} 입금 확인 및 발송 승인`} disabled={busy !== null} onClick={() => act(o.id, `${base}/approve`, `${o.orderNumber} 주문을 승인하고 5시간 다운로드 링크를 발급했습니다.`)}>
              {busy === o.id ? "처리하고 있습니다" : "입금 확인 및 5시간 링크 발급"}
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
          <button type="button" className={o.reissueRequestedAt ? "btn btn--primary" : "btn btn--ghost"} data-agent-action="reissue-link" aria-label={`주문 ${o.orderNumber} 다운로드 링크 재발급`} disabled={busy !== null} onClick={() => act(o.id, `${base}/reissue`, "새 5시간 링크를 발급했습니다.")}>
            5시간 링크 재발급
          </button>
        ) : null}
        {sending ? (
          <button type="button" className="btn btn--ghost" data-agent-action="mark-delivered" aria-label={`주문 ${o.orderNumber} 발송 완료 처리`} disabled={busy !== null} onClick={() => act(o.id, `${base}/mark-delivered`, "발송 완료로 처리했습니다.")}>
            전달 완료로 표시
          </button>
        ) : null}
      </div>
    </li>
  );
}
