import type { Metadata } from "next";
import { OrderLookup } from "@/components/OrderLookup";

export const metadata: Metadata = { title: "주문 조회" };

export default function Page() {
  return (
    <section className="section section--page">
      <div className="wrap wrap--narrow">
        <p className="eyebrow">주문 조회</p>
        <h1>주문번호로 진행 상황을 확인하세요</h1>
        <p className="lead">주문서를 제출하실 때 안내된 주문번호를 입력해 주세요. 이 기기에서 주문하셨다면 아래 목록에서 바로 여실 수 있습니다.</p>
        <OrderLookup />
      </div>
    </section>
  );
}
