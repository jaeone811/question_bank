import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-lib", "@pdf-lib/fontkit", "nodemailer"],
  poweredByHeader: false,
};
export default config;
