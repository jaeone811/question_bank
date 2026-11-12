// 개발자 호출: 터미널 벨 + OS 알림 + (설정 시) 텔레그램 봇 / 디스코드 웹훅. 전부 무료.
import notifier from "node-notifier";
import { config } from "../src/lib/config";

export async function notifyDeveloper(title: string, body: string) {
  process.stdout.write("\x07");
  console.log(`\n[알림] ${title}\n${body}\n`);
  try {
    notifier.notify({ title, message: body, sound: true }, () => {});
  } catch {
    // 알림 데몬이 없는 환경
  }
  const jobs: Promise<unknown>[] = [];
  const { token, chatId } = config.telegram;
  if (token && chatId)
    jobs.push(
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: `${title}\n${body}` }),
      }),
    );
  if (config.discordWebhook)
    jobs.push(
      fetch(config.discordWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `**${title}**\n${body}` }),
      }),
    );
  for (const r of await Promise.allSettled(jobs)) if (r.status === "rejected") console.error("알림 전송 실패:", String(r.reason));
}
