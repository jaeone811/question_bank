import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";

// 구매자 화면과 관리자 화면이 같은 헤더를 씀 (관리자 메뉴는 로그인했을 때만 표시)
export async function SiteHeader() {
  const admin = await isAdmin();
  return (
    <header className="site-header">
      <a className="skip" href="#main">본문으로 건너뛰기</a>
      <div className="wrap site-header__in">
        <Link href="/" className="brand" aria-label="기말고사 문제은행 홈">
          <Logo />
          <span>기말고사 문제은행</span>
        </Link>
        <nav className="nav" aria-label="주 메뉴">
          <Link href="/#catalog">자료 목록</Link>
          <Link href="/orders">주문 조회</Link>
          {admin ? (
            <>
              <span className="nav__sep" aria-hidden="true" />
              <Link href="/admin/agent" data-agent-action="open-agent-console">주문·에이전트</Link>
              <Link href="/admin/products" data-agent-action="open-products">패키지 관리</Link>
              <LogoutButton />
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__in">
        <p>기말고사 문제은행. 모든 자료는 구매하신 분의 개인 학습용으로만 제공됩니다.</p>
        <p>
          <Link href="/download/expired">다운로드 링크 재발급</Link>
          <Link href="/admin/agent">관리자</Link>
        </p>
      </div>
    </footer>
  );
}
