// 최초 1회: 에이전트 전용 브라우저에서 인스타그램에 직접 로그인 → 세션이 .agent-vault 에 저장됨
// 실행: npm run agent:login
import { agentEnv } from "./env";
import { createInterface } from "node:readline/promises";
import { closeBrowser, needsInstagramLogin, openBrowser, setState } from "./browser";

async function main() {
  const page = await openBrowser({ headless: false });
  await page.goto(`${agentEnv.instagramBase}/direct/inbox/`, { waitUntil: "domcontentloaded" });
  console.log("\n열린 브라우저 창에서 인스타그램에 로그인해 주세요 (2단계 인증 포함).");
  console.log("DM 받은편지함이 보이면 이 터미널로 돌아와 Enter 를 눌러 주세요.\n");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("로그인 완료 후 Enter > ");
  rl.close();

  await page.goto(`${agentEnv.instagramBase}/direct/inbox/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const ok = !(await needsInstagramLogin(page));
  setState("auth", ok ? "OK" : "AWAITING_HUMAN_AUTH");
  console.log(ok ? "세션을 저장했습니다. 이제 npm run agent 로 워커를 실행하시면 됩니다." : "아직 로그인되지 않은 것으로 보입니다. 다시 실행해 주세요.");
  await closeBrowser();
  process.exit(ok ? 0 : 1);
}

void main();
