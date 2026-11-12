"use client";

import { useRef, useState } from "react";
import type { Product } from "@/db/schema";
import { won } from "@/lib/format";

const EMPTY = { title: "", subject: "", difficulty: "", questionCount: "", price: "", description: "", sortOrder: "0", isActive: true };

export function ProductManager({ initial, dbError }: { initial: Product[]; dbError?: string | null }) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<Product | null>(null);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fullRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const reload = async () => {
    const res = await fetch("/api/admin/products", { cache: "no-store" });
    if (res.status === 401) return void (window.location.href = "/admin/login");
    if (res.ok) setList((await res.json()).data);
  };

  const reset = () => {
    setEditing(null);
    setF(EMPTY);
    if (fullRef.current) fullRef.current.value = "";
    if (sampleRef.current) sampleRef.current.value = "";
  };

  const edit = (p: Product) => {
    setEditing(p);
    setF({ title: p.title, subject: p.subject ?? "", difficulty: p.difficulty ?? "", questionCount: p.questionCount?.toString() ?? "", price: String(p.price), description: p.description ?? "", sortOrder: String(p.sortOrder), isActive: p.isActive });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const send = async (url: string, method: string, body?: FormData) => {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(url, { method, body });
      const json = await res.json();
      if (!res.ok) {
        setFlash({ tone: "bad", text: json.error ?? "처리하지 못했습니다." });
        return false;
      }
      await reload();
      return true;
    } catch {
      setFlash({ tone: "bad", text: "네트워크 오류가 발생했습니다." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) fd.set(k, String(v));
    const full = fullRef.current?.files?.[0];
    const sample = sampleRef.current?.files?.[0];
    if (full) fd.set("fullFile", full);
    if (sample) fd.set("sampleFile", sample);
    const ok = await send(editing ? `/api/admin/products/${editing.id}` : "/api/admin/products", editing ? "PATCH" : "POST", fd);
    if (ok) {
      setFlash({ tone: "ok", text: editing ? "패키지를 수정했습니다." : "패키지를 등록했습니다." });
      reset();
    }
  };

  const toggle = async (p: Product) => {
    const fd = new FormData();
    fd.set("title", p.title);
    fd.set("subject", p.subject ?? "");
    fd.set("difficulty", p.difficulty ?? "");
    fd.set("questionCount", p.questionCount?.toString() ?? "");
    fd.set("price", String(p.price));
    fd.set("description", p.description ?? "");
    fd.set("sortOrder", String(p.sortOrder));
    fd.set("isActive", String(!p.isActive));
    await send(`/api/admin/products/${p.id}`, "PATCH", fd);
  };

  const clearUploadedFiles = async (p: Product) => {
    const fd = new FormData();
    fd.set("title", p.title);
    fd.set("subject", p.subject ?? "");
    fd.set("difficulty", p.difficulty ?? "");
    fd.set("questionCount", p.questionCount?.toString() ?? "");
    fd.set("price", String(p.price));
    fd.set("description", p.description ?? "");
    fd.set("sortOrder", String(p.sortOrder));
    fd.set("isActive", String(p.isActive));
    fd.set("clearFiles", "true");
    const ok = await send(`/api/admin/products/${p.id}`, "PATCH", fd);
    if (ok) {
      setFlash({ tone: "ok", text: `"${p.title}"에 업로드된 문제 파일을 삭제했습니다.` });
      if (editing?.id === p.id) reset();
    }
  };

  const input = (k: keyof typeof EMPTY) => ({ value: f[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value })) });

  return (
    <div className="console">
      <div className="console__main">
        <div className="console__head">
          <div>
            <p className="eyebrow">관리자</p>
            <h1>패키지 관리</h1>
          </div>
        </div>
        {dbError ? (
          <p className="notice notice--bad" role="alert">
            <b>데이터베이스 연결 확인 필요:</b> {dbError} (Supabase SQL Editor에서 <code>supabase/schema.sql</code>을 실행했는지, Vercel 환경변수에 <code>SUPABASE_URL</code>과 <code>SUPABASE_SERVICE_ROLE_KEY</code>가 올바르게 들어갔는지 확인해 주세요.)
          </p>
        ) : null}
        {flash ? <p className={`notice notice--${flash.tone}`} role="status">{flash.text}</p> : null}

        <div className="catalog catalog--admin" role="table" aria-label="등록된 패키지">
          <div className="catalog__head" role="row">
            <span role="columnheader">과목</span>
            <span role="columnheader">패키지</span>
            <span role="columnheader">파일</span>
            <span role="columnheader" className="r">가격</span>
            <span role="columnheader">상태</span>
            <span role="columnheader" className="sr">관리</span>
          </div>
          {list.map((p) => {
            const visible = p.isActive && !!p.originalFilePath;
            return (
              <div className="catalog__row" role="row" key={p.id} data-product-id={p.id}>
                <span role="cell" className="catalog__subject">{p.subject ?? "기타"}</span>
                <span role="cell" className="catalog__main">
                  <b className="catalog__title">{p.title}</b>
                  <span className="catalog__desc">
                    {[p.difficulty, p.questionCount != null ? `${p.questionCount}문항` : null, p.pageCount != null ? `${p.pageCount}쪽` : null].filter(Boolean).join(" · ") || "세부 정보 미입력"}
                  </span>
                </span>
                <span role="cell" data-label="파일">
                  {p.originalFilePath ? "원본 있음" : "원본 없음"} / {p.samplePdfUrl ? "샘플 있음" : "샘플 없음"}
                </span>
                <span role="cell" data-label="가격" className="num r catalog__price">{won(p.price)}원</span>
                <span role="cell" data-label="상태">
                  <span className="badge" data-tone={visible ? "ok" : "idle"}>{visible ? "판매 중" : p.isActive ? "원본 업로드 필요" : "판매 중지"}</span>
                </span>
                <span role="cell" className="catalog__actions">
                  <button type="button" className="btn btn--ghost btn--sm" data-agent-action="edit-product" aria-label={`${p.title} 수정`} onClick={() => edit(p)}>수정</button>
                  {p.originalFilePath || p.samplePdfUrl ? (
                    <button type="button" className="btn btn--ghost btn--sm" data-agent-action="clear-product-files" aria-label={`${p.title} 업로드된 파일 삭제`} disabled={busy} onClick={() => clearUploadedFiles(p)}>
                      파일 삭제
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--ghost btn--sm" data-agent-action="toggle-product" aria-label={`${p.title} ${p.isActive ? "판매 중지" : "판매 재개"}`} disabled={busy} onClick={() => toggle(p)}>
                    {p.isActive ? "판매 중지" : "판매 재개"}
                  </button>
                  {confirmDelete === p.id ? (
                    <button type="button" className="btn btn--danger btn--sm" data-agent-action="confirm-delete-product" disabled={busy} onClick={async () => { const ok = await send(`/api/admin/products/${p.id}`, "DELETE"); if (ok) setFlash({ tone: "ok", text: `"${p.title}" 패키지를 삭제했습니다.` }); setConfirmDelete(null); }}>
                      삭제 확정
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" data-agent-action="delete-product" aria-label={`${p.title} 삭제`} onClick={() => setConfirmDelete(p.id)}>패키지 삭제</button>
                  )}
                </span>
              </div>
            );
          })}
          {list.length === 0 ? <p className="catalog__none">등록된 패키지가 없습니다. 오른쪽에서 새로 등록해 주세요.</p> : null}
        </div>
      </div>

      <aside className="console__side">
        <form className="panel stack-form" onSubmit={submit} ref={formRef} aria-label={editing ? "패키지 수정" : "새 패키지 등록"}>
          <h2>{editing ? "패키지 수정" : "새 패키지 등록"}</h2>
          <label className="field"><span className="field__label">패키지 이름</span><input name="title" {...input("title")} maxLength={60} required /></label>
          <div className="field-row">
            <label className="field"><span className="field__label">과목</span><input name="subject" {...input("subject")} placeholder="영어" /></label>
            <label className="field"><span className="field__label">난이도</span><input name="difficulty" {...input("difficulty")} placeholder="표준" /></label>
          </div>
          <div className="field-row">
            <label className="field"><span className="field__label">가격 (원)</span><input name="price" className="num" inputMode="numeric" {...input("price")} required /></label>
            <label className="field"><span className="field__label">문항 수</span><input name="questionCount" className="num" inputMode="numeric" {...input("questionCount")} /></label>
            <label className="field"><span className="field__label">표시 순서</span><input name="sortOrder" className="num" inputMode="numeric" {...input("sortOrder")} /></label>
          </div>
          <label className="field"><span className="field__label">설명</span><textarea name="description" rows={3} {...input("description")} /></label>
          <label className="field">
            <span className="field__label">원본 파일 (PDF, HWP, ZIP)</span>
            <input type="file" name="fullFile" ref={fullRef} accept=".pdf,.hwp,.hwpx,.zip" />
            <span className="field__hint">{editing?.originalFileName ? `현재: ${editing.originalFileName}. 새로 올리면 교체됩니다.` : "올려야 사이트에 표시됩니다. PDF는 쪽수 계산과 샘플 생성이 자동으로 됩니다."}</span>
          </label>
          <label className="field">
            <span className="field__label">샘플 PDF (선택)</span>
            <input type="file" name="sampleFile" ref={sampleRef} accept=".pdf" />
            <span className="field__hint">비워 두면 원본 PDF 앞 2쪽에 샘플 표시를 찍어 자동으로 만듭니다.</span>
          </label>
          <label className="check"><input type="checkbox" checked={f.isActive} onChange={(e) => setF((s) => ({ ...s, isActive: e.target.checked }))} /><span>판매 중으로 표시</span></label>
          <div className="order__actions">
            <button type="submit" className="btn btn--primary" data-agent-action="save-product" disabled={busy}>{busy ? "저장하고 있습니다" : editing ? "수정 내용 저장" : "패키지 등록"}</button>
            {editing ? <button type="button" className="btn btn--ghost" onClick={reset}>취소</button> : null}
          </div>
        </form>
      </aside>
    </div>
  );
}
