import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section section--page">
      <div className="wrap wrap--narrow">
        <p className="eyebrow">404</p>
        <h1>찾으시는 페이지가 없습니다</h1>
        <p className="lead">주소가 바뀌었거나 주문번호가 잘못 입력되었을 수 있습니다.</p>
        <Link className="btn btn--primary" href="/">자료 목록으로 가기</Link>
      </div>
    </section>
  );
}
