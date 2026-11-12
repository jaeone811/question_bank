// 이메일 발송: Gmail 계정 + 앱 비밀번호 SMTP (무료, 유료 메일 API 미사용)
import nodemailer from "nodemailer";
import { config } from "../src/lib/config";

export class NotConfigured extends Error {}

export async function sendEmail(to: string, subject: string, text: string) {
  const { user, appPassword } = config.gmail;
  if (!user || !appPassword) throw new NotConfigured("GMAIL_USER / GMAIL_APP_PASSWORD 가 설정되지 않아 이메일을 보낼 수 없습니다.");
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass: appPassword } });
  await transport.sendMail({ from: `기말고사 문제은행 <${user}>`, to, subject, text });
}
