// 설치 후 브라우저에서 직접 불러야 하는 파일을 public/vendor 로 복사 (CDN 미사용)
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor");
mkdirSync(out, { recursive: true });
const files = [
  ["node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2", "PretendardVariable.woff2"],
  ["node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "JetBrainsMono.woff2"],
];
const cmaps = join(root, "node_modules/pdfjs-dist/cmaps");
if (existsSync(cmaps)) cpSync(cmaps, join(out, "cmaps"), { recursive: true });
for (const [from, to] of files) {
  const src = join(root, from);
  if (existsSync(src)) cpSync(src, join(out, to));
  else console.warn("[copy-assets] 없음:", from);
}
