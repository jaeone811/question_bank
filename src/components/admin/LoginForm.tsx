"use client";

import { useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack-form"
      aria-label="관리자 로그인"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        setBusy(false);
        if (res.ok) window.location.href = "/admin/agent";
        else setError((await res.json()).error ?? "로그인하지 못했습니다.");
      }}
    >
      <label className="field">
        <span className="field__label">관리자 비밀번호</span>
        <input type="password" name="password" data-agent-field="admin-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn--primary" data-agent-action="admin-login" disabled={busy}>로그인</button>
    </form>
  );
}
