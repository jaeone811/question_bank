import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 및 데이터 삭제 안내",
  description: "기말고사 문제은행의 개인정보 수집·이용 방침 및 사용자 데이터 삭제 안내입니다.",
};

export default function PrivacyPage() {
  return (
    <article className="wrap" style={{ maxWidth: "760px", padding: "48px 16px", lineHeight: "1.75" }}>
      <header style={{ marginBottom: "32px", borderBottom: "1px solid var(--border, #E5E7EB)", paddingBottom: "20px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 8px 0" }}>
          개인정보처리방침 및 데이터 삭제 안내
        </h1>
        <p style={{ color: "var(--muted, #6B7280)", margin: 0, fontSize: "0.925rem" }}>
          시행일자: 2026년 11월 19일
        </p>
      </header>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 12px 0" }}>1. 개인정보의 수집 및 이용 목적</h2>
        <p style={{ margin: "0 0 12px 0" }}>
          &apos;기말고사 문제은행&apos;(이하 &apos;서비스&apos;)은 학습 자료 구매, 본인 확인, 자료 전송 및 저작권 보호를 위해 최소한의 개인정보를 수집·이용합니다.
        </p>
        <ul style={{ paddingLeft: "20px", margin: 0 }}>
          <li><strong>수집 항목</strong>: 구매자 성명, 입금자명, 연락처(휴대폰 번호), 인스타그램 아이디, 이메일 주소</li>
          <li><strong>이용 목적</strong>: 주문 접수 및 입금 확인, 5시간 다운로드 링크 발송(인스타그램 공식 DM 및 이메일), PDF 보안 워터마크 삽입(성함·연락처·주문번호), 다운로드 링크 만료 시 재발급 처리</li>
          <li><strong>보유 및 이용 기간</strong>: 주문 처리 및 기말고사 시즌 운영 종료(2026년 12월 11일) 시까지 보관 후 지체 없이 영구 파기</li>
        </ul>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 12px 0" }}>2. 개인정보의 제3자 제공 및 위탁</h2>
        <p style={{ margin: "0 0 12px 0" }}>
          서비스는 안전한 자료 발송을 위하여 다음과 같이 외부 공식 플랫폼을 통해서만 데이터를 처리합니다:
        </p>
        <ul style={{ paddingLeft: "20px", margin: 0 }}>
          <li><strong>Meta Platforms (Instagram Messaging API)</strong>: 구매자가 지정한 인스타그램 계정으로 1:1 다운로드 안내 DM 발송</li>
          <li><strong>Google Cloud Platform & Gmail</strong>: 시스템 자동화 서버 호스팅 및 주문 안내 이메일 발송</li>
        </ul>
      </section>

      <section id="data-deletion" style={{ marginBottom: "40px", backgroundColor: "var(--bg-subtle, #F9FAFB)", padding: "24px", borderRadius: "12px", border: "1px solid var(--border, #E5E7EB)" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 12px 0" }}>3. 사용자 데이터 삭제 안내 (Data Deletion Instructions)</h2>
        <p style={{ margin: "0 0 12px 0" }}>
          사용자는 언제든지 서비스에 제공된 개인정보 및 인스타그램 연동 식별자(IGSID)의 삭제를 요청하실 수 있습니다.
        </p>
        <div style={{ margin: "0 0 16px 0" }}>
          <strong>[삭제 요청 방법]</strong>
          <ol style={{ paddingLeft: "20px", marginTop: "8px", marginBottom: "8px" }}>
            <li>
              관리자 이메일(<code>cocojjone99@gmail.com</code>) 또는 인스타그램 공식 계정(<code>@haewon_question_bank</code>)으로 구매자 성함과 함께 &quot;개인정보 삭제 요청&quot; 메시지를 전송합니다.
            </li>
            <li>
              또는 페이스북/인스타그램 계정의 <em>[설정 및 개인정보] → [앱 및 웹사이트]</em>에서 <code>haewon_question_bank</code> 앱 연결을 삭제하시면 웹후크 연동 식별자가 즉시 무효화됩니다.
            </li>
          </ol>
        </div>
        <p style={{ margin: 0, fontSize: "0.925rem", color: "var(--muted, #6B7280)" }}>
          요청이 접수되면 시스템 관리자는 24시간 이내에 데이터베이스 및 발송 로그에 등록된 개인 식별 정보를 영구 삭제 또는 비식별화 처리하고 결과를 안내해 드립니다.
        </p>
      </section>

      <footer style={{ marginTop: "40px", borderTop: "1px solid var(--border, #E5E7EB)", paddingTop: "20px" }}>
        <Link href="/" className="btn btn--secondary" style={{ display: "inline-block" }}>
          ← 홈으로 돌아가기
        </Link>
      </footer>
    </article>
  );
}
