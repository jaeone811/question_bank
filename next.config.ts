import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "nodemailer"],
  outputFileTracingIncludes: {
    "/*": [
      "./public/vendor/Pretendard-SemiBold.ttf",
      "./node_modules/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf",
    ],
  },
  poweredByHeader: false,
};
export default config;
