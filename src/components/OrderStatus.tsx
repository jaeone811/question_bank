"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatKst, won } from "@/lib/format";
import type { PublicOrderStatus } from "@/lib/orders";

const METHOD = { BANK: "계좌이체", KAKAOPAY: "카카오페이", TOSS: "토스" } as const;
const CHANNEL = { INSTAGRAM: "인스타그램 DM", EMAIL: "이메일" } as const;

type Tone = "wait" | "ok" | "bad";
const HEADLINE: Record<PublicOrderStatus["status"], { tone: Tone; title: string; body: string }> = {
  PENDING_VERIFICATION: { tone: "wait", title: "주문서를 접수했습니다", body: "판매자가 입금 내역을 확인하고 있습니다. 확인되는 즉시 다운로드 링크를 보내 드립니다." },
  NOTIFIED_USER: { tone: "wait", title: "접수 안내를 보내 드렸습니다", body: "판매자가 입금 내역을 확인하고 있습니다. 확인되는 즉시 다운로드 링크를 보내 드립니다." },
  APPROVED: { tone: "ok", title: "입금이 확인되었습니다", body: "다운로드 링크를 보낼 준비를 하고 있습니다." },
  DISPATCHING: { tone: "ok", title: "다운로드 링크를 보내고 있습니다", body: "잠시만 기다려 주세요." },
  DELIVERED: { tone: "ok", title: "다운로드 링크를 보내 드렸습니다", body: "선택하신 곳에서 메시지를 확인해 주세요. 인스타그램은 메시지 요청함에 있을 수 있습니다." },
  DISPATCH_FAILED: { tone: "wait", title: "입금은 확인되었고, 링크를 다시 보내는 중입니다", body: "자동 발송에 문제가 있어 판매자가 직접 보내 드릴 예정입니다. 조금만 기다려 주세요." },
  EXPIRED: { tone: "bad", title: "다운로드 링크가 만료되었습니다", body: "아래에서 재발급을 요청하실 수 있습니다." },
  REJECTED: { tone: "bad", title: "입금 내역을 확인하지 못했습니다", body: "입금자명과 금액을 확인하신 뒤 판매자에게 문의해 주세요." },
};

export function OrderStatus({ initial }: { initial: PublicOrderStatus }) {
  const [o, setO] = useState(initial);

  // 4초마다 상태를 다시 받아 옴 (끝난 주문은 멈춤)
  useEffect(() => {
    if (["EXPIRED", "REJECTED"].includes(o.status)) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/orders/${o.orderNumber}`, { cache: "no-store" });
        if (res.ok) setO((await res.json()).data);
      } catch {
        // 일시적 오류는 다음 주기에 다시 시도
      }
    }, 4000);
    return () => clearInterval(t);
  }, [o.orderNumber, o.status]);

  const h = HEADLINE[o.status];
  const rejected = o.status === "REJECTED";
  const sent = ["DELIVERED", "EXPIRED"].includes(o.status);
  const steps: { label: string; done: boolean; at?: number | null; note?: string }[] = [
    { label: "주문서 접수", done: true, at: o.createdAt },
    { label: "AI 에이전트 확인", done: o.agentSeen, note: o.agentSeen ? "AI 에이전트가 주문서를 확인했습니다. 판매자 입금 확인 후 즉시 링크가 발송됩니다." : "에이전트가 주문서를 확인할 차례입니다." },
    { label: "판매자 입금 확인", done: !!o.approvedAt, at: o.approvedAt, note: rejected ? "입금 내역을 확인하지 못했습니다." : undefined },
    { label: "다운로드 링크 발송", done: sent, at: o.deliveredAt, note: o.channels.map((c) => CHANNEL[c]).join(", ") + "(으)로 보내 드립니다." },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="status">
      <div className="status__head" data-tone={h.tone} aria-live="polite">
        <p className="eyebrow">주문 <span className="num">{o.orderNumber}</span></p>
        <h1>{h.title}</h1>
        <p className="lead">{h.body}</p>
        {o.status === "DELIVERED" && o.expiresAt ? (
          <p className="status__expiry">
            링크는 <b className="num">{formatKst(o.expiresAt)}</b>까지 유효하며, 남은 횟수는 <b className="num">{o.downloadsLeft}</b>회입니다.
          </p>
        ) : null}
        {o.status === "EXPIRED" ? (
          <Link className="btn btn--primary" href={`/download/expired?order=${o.orderNumber}`}>링크 재발급 요청하기</Link>
        ) : null}
      </div>

      <div className="status__grid">
        <ol className="timeline">
          {steps.map((s, i) => (
            <li key={s.label} data-state={s.done ? "done" : rejected && i === 2 ? "bad" : i === current && !rejected ? "now" : "todo"}>
              <b>{s.label}</b>
              {s.at ? <time className="num">{formatKst(s.at)}</time> : null}
              {s.note && (s.done || i === current) ? <span>{s.note}</span> : null}
            </li>
          ))}
        </ol>

        <dl className="receipt">
          <div><dt>자료</dt><dd>{o.productLabel}</dd></div>
          <div><dt>금액</dt><dd className="num">{won(o.amount)}원</dd></div>
          <div><dt>송금 방법</dt><dd>{METHOD[o.paymentMethod]}</dd></div>
          <div><dt>입금자명</dt><dd>{o.depositorName}</dd></div>
          <div><dt>받으실 곳</dt><dd>{o.channels.map((c) => CHANNEL[c]).join(", ")}</dd></div>
          <div><dt>접수 시각</dt><dd className="num">{formatKst(o.createdAt)}</dd></div>
        </dl>
      </div>
      <p className="status__tip">이 주소를 저장해 두시면 언제든 진행 상황을 다시 확인하실 수 있습니다. 주문번호는 <Link href="/orders">주문 조회</Link>에서도 쓰실 수 있습니다.</p>
    </div>
  );
}
