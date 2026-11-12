import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "nodemailer"],
  outputFileTracingIncludes: {
    "/api/download/[token]": ["./public/vendor/Pretendard-SemiBold.ttf"],
    "/api/admin/products": ["./public/vendor/Pretendard-SemiBold.ttf"],
    "/api/admin/products/[id]": ["./public/vendor/Pretendard-SemiBold.ttf"],
  },
  poweredByHeader: false,
};
export default config;
