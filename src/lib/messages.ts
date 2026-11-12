import { formatKst, productLabel } from "./format";

type P = { subject: string | null; title: string };

// 에이전트가 보내는 기본 문구. 링크와 만료 시각은 항상 이 템플릿이 넣음 (LLM 이 건드리지 않음)
export function ackMessage(buyerName: string, product: P, greeting?: string) {
  return (
    greeting?.trim() ||
    `안녕하세요 ${buyerName}님, [${productLabel(product)}] 주문이 접수되었습니다. 입금 확인 즉시 다운로드 링크를 보내드립니다.`
  );
}

export function linkMessage(buyerName: string, product: P, url: string, expiresAt: number, maxDownloads: number, greeting?: string) {
  const head = greeting?.trim() || `안녕하세요 ${buyerName}님, 입금이 확인되어 [${productLabel(product)}] 자료를 보내드립니다.`;
  return [
    head,
    `다운로드: ${url}`,
    `이 링크는 ${formatKst(expiresAt)} (한국 시간)까지, 최대 ${maxDownloads}회 받으실 수 있습니다.`,
    `자료에는 구매자 정보가 워터마크로 표시됩니다. 개인 학습용으로만 이용해 주세요.`,
  ].join("\n");
}
