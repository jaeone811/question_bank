"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst, won } from "@/lib/format";
import type { AdminOverview } from "@/lib/orders";

type O = AdminOverview["orders"][number];

const STATUS: Record<O["status"], { label: string; tone: "wait" | "ok" | "bad" | "idle" }> = {
  PENDING_VERIFICATION: { label: "1단계: 승인 대기", tone: "wait" },
  NOTIFIED_USER: { label: "1단계: 승인 대기", tone: "wait" },
  APPROVED: { label: "2단계: 링크 발급됨 (발송 대기)", tone: "ok" },
  DISPATCHING: { label: "2단계: 발송 중", tone: "ok" },
  DELIVERED: { label: "발송 완료", tone: "ok" },
  DISPATCH_FAILED: { label: "발송 실패", tone: "bad" },
  EXPIRED: { label: "링크 만료", tone: "idle" },
  REJECTED: { label: "입금 미확인", tone: "bad" },
};

const CHANNEL_LABEL = {
  INSTAGRAM_DM: "인스타그램 DM",
  EMAIL: "이메일",
  BOTH: "인스타그램 DM + 이메일",
} as const;

// 첫 번째 탭('todo')에 승인 대기 + 링크 전달 대기를 모두 표시해 피클 AI가 탭 이동 없이 한 화면에서 처리하도록 구성
const TABS = [
  {
    id: "todo",
    label: "처리할 주문",
    match: (o: O) =>
      ["PENDING_VERIFICATION", "NOTIFIED_USER", "APPROVED", "DISPATCHING", "DISPATCH_FAILED"].includes(o.status) ||
      !!o.reissueRequestedAt,
  },
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
          {shown.length === 0 ? <li className="orders__none">처리할 주문이 없습니다.</li> : null}
        </ul>
      </div>

      <aside className="console__side" aria-label="연동 및 작업 상태">
        <div className="panel">
          <h2>발송 처리 순서 (피클 AI)</h2>
          <dl className="kv">
            <div><dt>1단계</dt><dd><b>[1. 승인 및 5시간 링크 생성]</b> 클릭</dd></div>
            <div><dt>2단계</dt><dd>생성된 <b>발송 문구</b>를 복사해 구매자가 선택한 곳(인스타 DM 또는 이메일)으로 전송</dd></div>
            <div><dt>3단계</dt><dd><b>[3. 발송 완료 처리]</b> 클릭 (완료 탭으로 이동)</dd></div>
          </dl>
          <p className="panel__hint">
            저장소: Supabase · 이메일 서버 발송: {emailReady ? "활성" : "피클 AI 직접 발송"} · 웹훅: {pickleWebhookReady ? "활성" : "미사용"}
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
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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
          <span>계좌이체</span>
        </div>
        <dl className="kv">
          <div><dt>자료</dt><dd>{o.productLabel}</dd></div>
          <div><dt>구매자</dt><dd>{o.buyerName} <span className="num">({o.buyerPhone})</span></dd></div>
          <div><dt>보낼 곳</dt><dd><b>{CHANNEL_LABEL[o.preferredChannel]}</b></dd></div>
          {o.buyerInstagram ? <div><dt>인스타 아이디</dt><dd className="num">@{o.buyerInstagram}</dd></div> : null}
          {o.buyerEmail ? <div><dt>이메일 주소</dt><dd className="num">{o.buyerEmail}</dd></div> : null}
          {o.token ? (
            <div><dt>링크 상태</dt><dd className="num" data-tone={expired ? "bad" : undefined}>{expired ? "만료됨" : `${formatKst(o.token.expiresAt)}까지`} · {o.token.downloadCount}/{o.token.maxDownloads}회 사용</dd></div>
          ) : null}
        </dl>
      </div>

      {o.downloadUrl && o.dmMessage ? (
        <div className="fallback" role="group" aria-label="발송할 문구 및 링크">
          <textarea
            readOnly
            rows={4}
            value={o.dmMessage}
            aria-label={`주문 ${o.orderNumber} 발송 문구`}
            style={{ width: "100%", marginBottom: "0.5rem", fontFamily: "inherit", fontSize: "0.9rem" }}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            data-agent-action="copy-dm-message"
            onClick={async () => {
              await navigator.clipboard.writeText(o.dmMessage ?? "");
              setCopiedMsg(true);
              setTimeout(() => setCopiedMsg(false), 2000);
            }}
          >
            {copiedMsg ? "문구 복사됨" : "2. 발송할 전체 문구 복사"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={async () => {
              await navigator.clipboard.writeText(o.downloadUrl ?? "");
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
          >
            {copiedLink ? "링크 복사됨" : "링크만 복사"}
          </button>
          {o.buyerInstagram ? (
            <a className="btn btn--ghost btn--sm" data-agent-action="open-instagram-dm" href={`https://ig.me/m/${o.buyerInstagram}`} target="_blank" rel="noopener">
              인스타 DM 열기 (@{o.buyerInstagram})
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="order__actions">
        {pending ? (
          <>
            <button type="button" className="btn btn--primary" data-agent-action="approve-order" aria-label={`주문 ${o.orderNumber} 승인 및 5시간 링크 생성`} disabled={busy !== null} onClick={() => act(o.id, `${base}/approve`, `${o.orderNumber} 주문을 승인하고 5시간 다운로드 링크를 생성했습니다.`)}>
              {busy === o.id ? "처리 중..." : "1. 승인 및 5시간 링크 생성"}
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
        {sending ? (
          <button type="button" className="btn btn--primary" data-agent-action="mark-delivered" aria-label={`주문 ${o.orderNumber} 발송 완료 처리`} disabled={busy !== null} onClick={() => act(o.id, `${base}/mark-delivered`, "발송 완료로 처리했습니다.")}>
            3. 발송 완료 처리
          </button>
        ) : null}
        {reissuable ? (
          <button type="button" className={o.reissueRequestedAt ? "btn btn--primary" : "btn btn--ghost"} data-agent-action="reissue-link" aria-label={`주문 ${o.orderNumber} 5시간 링크 재발급`} disabled={busy !== null} onClick={() => act(o.id, `${base}/reissue`, "새 5시간 링크를 발급했습니다.")}>
            5시간 링크 재발급
          </button>
        ) : null}
      </div>
    </li>
  );
}
