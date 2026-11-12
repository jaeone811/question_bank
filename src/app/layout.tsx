import type { Metadata, Viewport } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "기말고사 문제은행", template: "%s | 기말고사 문제은행" },
  description: "고2 내신 대비 변형 문제 PDF. 샘플을 먼저 확인하고 계좌이체로 구매하실 수 있습니다.",
  other: { "page-type": "product", "site-kind": "other" },
};
export const viewport: Viewport = { themeColor: "#FAF8F5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-type="product" data-radius="soft" data-buttons="solid" data-motion="quiet">
      <body>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
