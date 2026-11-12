export const won = (n: number) => n.toLocaleString("ko-KR");

const kst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
// 2026. 11. 12. 21:05 형태 (항상 한국 시간)
export const formatKst = (ms: number) => kst.format(new Date(ms));

export const maskName = (s: string) => (s.length <= 1 ? s : s[0] + "*".repeat(Math.max(1, s.length - 2)) + (s.length > 2 ? s[s.length - 1] : ""));

export const productLabel = (p: { subject: string | null; title: string }) => [p.subject, p.title].filter(Boolean).join(" · ");
