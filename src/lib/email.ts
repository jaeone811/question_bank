import nodemailer from "nodemailer";
import { config } from "./config";

export function isEmailConfigured(): boolean {
  return Boolean(config.gmail.user && config.gmail.appPassword);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const { user, appPassword } = config.gmail;
  if (!user || !appPassword) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD 가 설정되지 않아 이메일을 보낼 수 없습니다.");
  }
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: appPassword },
  });
  await transport.sendMail({
    from: `기말고사 문제은행 <${user}>`,
    to,
    subject,
    text,
  });
}

// 피클 AI 또는 외부 웹훅 연동 (선택 사항: PICKLE_WEBHOOK_URL 설정 시 호출)
export async function notifyPickleWebhook(event: string, payload: Record<string, unknown>): Promise<boolean> {
  const { webhookUrl, apiKey } = config.pickle;
  if (!webhookUrl) return false;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, timestamp: Date.now(), ...payload }),
    });
    return res.ok;
  } catch (e) {
    console.error("[pickle-webhook] 전송 실패:", e);
    return false;
  }
}
