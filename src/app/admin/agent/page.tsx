import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentConsole } from "@/components/admin/AgentConsole";
import { isAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { adminOverview } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "주문·발송 관리", robots: { index: false } };

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <section className="section section--page section--wide">
      <div className="wrap">
        <AgentConsole
          initial={await adminOverview()}
          emailReady={!!(config.gmail.user && config.gmail.appPassword)}
          pickleWebhookReady={!!config.pickle.webhookUrl}
        />
      </div>
    </section>
  );
}
