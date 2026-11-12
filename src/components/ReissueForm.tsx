"use client";

import Link from "next/link";
import { useState } from "react";

export function ReissueForm({ defaultOrder }: { defaultOrder: string }) {
  const [orderNumber, setOrderNumber] = useState(defaultOrder);
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ orderNumber: string; already: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!orderNumber.trim() || !contact.trim()) return setError("주문번호와 연락처를 모두 입력해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/orders/reissue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, contact }) });
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "요청을 처리하지 못했습니다.");
      setDone(json.data);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="notice notice--ok" role="status">
        <b>{done.already ? "이미 재발급 요청이 접수되어 있습니다." : "재발급 요청을 접수했습니다."}</b>
        <p>판매자가 확인하는 대로 새 링크를 보내 드립니다. <Link href={`/orders/${done.orderNumber}`}>진행 상황 보기</Link></p>
      </div>
    );

  return (
    <form className="stack-form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="field__label">주문번호</span>
        <input className="num" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="QB-261112-AB12CD34" spellCheck={false} />
      </label>
      <label className="field">
        <span className="field__label">주문 때 입력하신 연락처</span>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="인스타그램 아이디, 이메일, 휴대전화 번호 중 하나" autoCapitalize="none" spellCheck={false} />
        <span className="field__hint">본인 확인용입니다. 주문서에 적으신 값과 같아야 합니다.</span>
      </label>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "요청하고 있습니다" : "재발급 요청 보내기"}</button>
    </form>
  );
}
