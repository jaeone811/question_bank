import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdmin } from "@/lib/auth";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "관리자 로그인", robots: { index: false } };

export default async function Page() {
  if (await isAdmin()) redirect("/admin/agent");
  return (
    <section className="section section--page">
      <div className="wrap wrap--narrow">
        <p className="eyebrow">관리자</p>
        <h1>관리자 로그인</h1>
        {config.adminPassword ? (
          <LoginForm />
        ) : (
          <p className="notice">서버에 ADMIN_PASSWORD 환경변수가 설정되지 않아 로그인할 수 없습니다. .env.local 파일에 추가한 뒤 서버를 다시 시작해 주세요.</p>
        )}
      </div>
    </section>
  );
}
