// Persistent Browser Vault: 로그인 세션(쿠키)을 .agent-vault/browser-profile 에 보존하는 전용 크롬 프로필
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { paths } from "../src/lib/config";
import { agentEnv } from "./env";
import { IG } from "./selectors";

let ctx: BrowserContext | undefined;
let page: Page | undefined;

export function setState(key: string, value: string) {
  const now = Date.now();
  getDb()
    .insert(schema.agentState)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: schema.agentState.key, set: { value, updatedAt: now } })
    .run();
}
export const getState = (key: string) => getDb().select().from(schema.agentState).where(eq(schema.agentState.key, key)).get()?.value;

export async function openBrowser(opts: { headless?: boolean } = {}): Promise<Page> {
  if (page && !page.isClosed()) return page;
  mkdirSync(paths.screenshots(), { recursive: true });
  ctx = await chromium.launchPersistentContext(path.join(paths.vault(), "browser-profile"), {
    headless: opts.headless ?? agentEnv.headless,
    executablePath: agentEnv.chromePath,
    viewport: { width: 1180, height: 820 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  ctx.on("close", () => {
    ctx = undefined;
    page = undefined;
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  return page;
}

export async function closeBrowser() {
  await ctx?.close().catch(() => {});
  ctx = undefined;
  page = undefined;
}

// 관제 화면의 실시간 미리보기용 캡처
export async function captureLive() {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: path.join(paths.screenshots(), "live.jpg"), type: "jpeg", quality: 55 });
    setState("live_at", String(Date.now()));
  } catch {
    // 이동 중이면 건너뜀
  }
}

export async function saveEvidence(name: string) {
  const file = `${name}.png`;
  await page!.screenshot({ path: path.join(paths.screenshots(), file) });
  return file;
}

export async function needsInstagramLogin(p: Page) {
  if (IG.loginUrl.test(p.url())) return true;
  return (await p.locator(IG.loginForm).count()) > 0;
}

export class HumanAuthRequired extends Error {}

// 로그인·캡차·2단계 인증이 뜨면 사람이 직접 끝낼 때까지 기다림 (핸드오프)
export async function waitForHumanAuth(p: Page, onTick: () => void): Promise<void> {
  if (agentEnv.headless) throw new HumanAuthRequired("인스타그램 로그인이 필요합니다. 워커를 멈추고 npm run agent:login 을 실행해 주세요.");
  await p.bringToFront().catch(() => {});
  const deadline = Date.now() + agentEnv.authTimeoutMs;
  while (Date.now() < deadline) {
    await p.waitForTimeout(3000);
    onTick();
    await captureLive();
    if (p.isClosed()) throw new HumanAuthRequired("인증 중 브라우저 창이 닫혔습니다.");
    if (!(await needsInstagramLogin(p))) return;
  }
  throw new HumanAuthRequired("인증 대기 시간이 지났습니다. 로그인 후 작업을 다시 시도해 주세요.");
}
