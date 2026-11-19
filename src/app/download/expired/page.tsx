import type { Metadata } from "next";
import { ReissueForm } from "@/components/ReissueForm";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "다운로드 링크 재발급", robots: { index: false } };

const REASON: Record<string, { title: string; body: string }> = {
  expired: { title: "다운로드 링크의 유효 시간이 지났습니다", body: "링크는 입금 확인 시각부터 5시간 동안만 열립니다." },
  revoked: { title: "새 링크가 발급되어 이전 링크는 닫혔습니다", body: "가장 최근에 받으신 메시지의 링크를 이용해 주세요." },
  invalid: { title: "올바르지 않은 다운로드 링크입니다", body: "링크가 잘리지 않았는지 확인해 주세요. 메시지의 링크를 그대로 누르시는 것이 가장 정확합니다." },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ reason?: string; order?: string }> }) {
  const sp = await searchParams;
  const r = REASON[sp.reason ?? ""] ?? { title: "다운로드 링크를 다시 받으실 수 있습니다", body: "링크가 만료된 경우 재발급을 요청해 주세요." };
  const igHandle = config.sellerInstagram;
  return (
    <section className="section section--page">
      <div className="wrap wrap--narrow">
        <p className="eyebrow">다운로드 안내</p>
        <h1>{r.title}</h1>
        <p className="lead">
          {r.body} 아래에 주문 정보를 입력하시면 판매자에게 재발급 요청이 전달되고, 승인되면 새 링크가 처음 받으신 곳(이메일 또는 @{igHandle} 인스타그램 DM)으로 자동 발송됩니다. 인스타그램 DM 수령 주문은 @{igHandle} 24시간 대화창이 열려 있어야 하며, 24시간이 지난 경우 먼저 DM(&quot;신청&quot;)을 한 번 더 보내 주세요.
        </p>
        <ReissueForm defaultOrder={sp.order ?? ""} />
      </div>
    </section>
  );
}
