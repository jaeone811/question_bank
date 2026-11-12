// 인스타그램 웹 DM 자동 발송: 새 메시지 → 아이디 검색 → 계정 선택 → 채팅방 → 입력 → 전송 → 캡처
import type { Page } from "playwright";
import { agentEnv } from "./env";
import { captureLive, needsInstagramLogin, openBrowser, saveEvidence, waitForHumanAuth } from "./browser";
import { IG } from "./selectors";

export class DmBlocked extends Error {} // 계정 없음·비공개·수신 제한 등: 자동 발송 불가 → 수동 보조 수단 안내

const pause = (p: Page, min: number, max: number) => p.waitForTimeout(min + Math.random() * (max - min));
let lastSentAt = 0;

async function dismissPopups(p: Page) {
  const btn = p.getByRole("button", { name: IG.dismissButtons }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
}

export async function sendInstagramDm(opts: {
  username: string;
  message: string;
  evidenceName: string;
  onAwaitingAuth: () => void;
  onAuthResolved: () => void;
  onTick: () => void;
  log: (m: string) => void;
}): Promise<string> {
  const { username, message, log } = opts;
  const wait = lastSentAt + agentEnv.igMinIntervalMs - Date.now();
  if (wait > 0) {
    log(`계정 보호를 위해 ${Math.ceil(wait / 1000)}초 기다린 뒤 보냅니다`);
    await new Promise((r) => setTimeout(r, wait));
  }

  const p = await openBrowser();
  const live = setInterval(() => void captureLive(), 1500);
  try {
    log("인스타그램 새 메시지 화면으로 이동");
    await p.goto(`${agentEnv.instagramBase}/direct/new/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await pause(p, 800, 1500);

    if (await needsInstagramLogin(p)) {
      log("로그인 또는 추가 인증 필요: 사람의 확인을 기다립니다");
      opts.onAwaitingAuth();
      await waitForHumanAuth(p, opts.onTick);
      opts.onAuthResolved();
      log("인증 완료, 작업을 이어갑니다");
      await p.goto(`${agentEnv.instagramBase}/direct/new/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await pause(p, 800, 1500);
    }
    await dismissPopups(p);

    log(`받는 사람 검색: @${username}`);
    const search = p.locator(IG.searchInput).first();
    await search.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {
      throw new Error("검색창을 찾지 못했습니다. 인스타그램 화면 구성이 바뀌었을 수 있습니다 (agent-worker/selectors.ts 확인).");
    });
    await search.click();
    await search.pressSequentially(username, { delay: 70 + Math.random() * 60 });

    const result = p.getByText(username, { exact: true }).first();
    await result.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {
      throw new DmBlocked(`@${username} 계정을 검색 결과에서 찾지 못했습니다.`);
    });
    await pause(p, 400, 900);
    await result.click();
    await pause(p, 300, 700);

    const start = p.getByRole("button", { name: IG.startChatButton }).first();
    if (await start.isVisible().catch(() => false)) await start.click();

    const box = p.locator(IG.messageBox).first();
    await box.waitFor({ state: "visible", timeout: 15_000 }).catch(async () => {
      const body = await p.locator("body").innerText().catch(() => "");
      throw new DmBlocked(IG.blocked.test(body) ? `@${username} 계정이 메시지 수신을 제한하고 있습니다.` : `@${username} 채팅방의 입력창이 열리지 않았습니다.`);
    });
    await dismissPopups(p);

    log("메시지 입력");
    await box.click();
    const lines = message.split("\n");
    for (let i = 0; i < lines.length; i++) {
      await p.keyboard.insertText(lines[i]);
      if (i < lines.length - 1) await p.keyboard.press("Shift+Enter"); // Enter 는 전송이라 줄바꿈은 Shift+Enter
      await pause(p, 120, 300);
    }
    await pause(p, 400, 900);
    await p.keyboard.press("Enter");
    lastSentAt = Date.now();

    // 보낸 메시지가 대화창에 나타나는지 확인
    const probe = lines[0].slice(0, 24);
    await p.getByText(probe, { exact: false }).last().waitFor({ state: "visible", timeout: 12_000 }).catch(() => {
      throw new Error("전송 후 대화창에서 메시지를 확인하지 못했습니다. 실제 전송 여부를 캡처로 확인해 주세요.");
    });
    await pause(p, 900, 1500);
    if (IG.sendFailed.test(await p.locator("body").innerText().catch(() => ""))) throw new DmBlocked("인스타그램이 메시지 전송을 거부했습니다.");

    log("전송 완료, 증거 캡처 저장");
    return await saveEvidence(opts.evidenceName);
  } catch (e) {
    await saveEvidence(`${opts.evidenceName}-error`).catch(() => {});
    throw e;
  } finally {
    clearInterval(live);
    await captureLive();
  }
}
