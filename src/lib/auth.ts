import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { appSecret, config } from "./config";

const COOKIE = "qb_admin";
const TTL = 7 * 24 * 60 * 60 * 1000;
const sign = (v: string) => createHmac("sha256", appSecret()).update(`admin:${v}`).digest("base64url");
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function checkPassword(pw: string) {
  const real = config.adminPassword;
  if (!real) return false; // 비밀번호 미설정이면 로그인 불가
  return safeEq(sign(pw), sign(real));
}

export async function setAdminCookie() {
  const exp = String(Date.now() + TTL);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.siteUrl.startsWith("https://"),
    path: "/",
    maxAge: TTL / 1000,
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  return !!exp && !!sig && safeEq(sig, sign(exp)) && Number(exp) > Date.now();
}
