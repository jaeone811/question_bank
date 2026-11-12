"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="nav__btn"
      data-agent-action="admin-logout"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.href = "/";
      }}
    >
      로그아웃
    </button>
  );
}
