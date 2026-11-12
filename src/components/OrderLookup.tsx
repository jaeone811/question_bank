"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function OrderLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    try {
      setMine(JSON.parse(localStorage.getItem("qb_orders_v2") ?? "[]"));
    } catch {
      // 저장소를 쓸 수 없는 환경
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const no = value.trim().toUpperCase();
    if (!/^QB-\d{6}-[0-9A-Z]{8}$/.test(no)) return setError("주문번호 형식을 확인해 주세요. 예: QB-261112-AB12CD34");
    const res = await fetch(`/api/orders/${no}`);
    if (!res.ok) return setError("해당 주문번호를 찾지 못했습니다.");
    router.push(`/orders/${no}`);
  };

  return (
    <>
      <form className="inline-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">주문번호</span>
          <input className="num" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} placeholder="QB-261112-AB12CD34" autoCapitalize="characters" spellCheck={false} />
          {error ? <span className="field__error" role="alert">{error}</span> : null}
        </label>
        <button type="submit" className="btn btn--primary">진행 상황 보기</button>
      </form>
      {mine.length ? (
        <div className="mine">
          <h2>이 기기에서 접수한 주문</h2>
          <ul>
            {mine.map((no) => (
              <li key={no}><Link className="num" href={`/orders/${no}`}>{no}</Link></li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
