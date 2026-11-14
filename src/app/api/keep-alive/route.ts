import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabase();

    const [productsRes, ordersRes, bucketsRes] = await Promise.all([
      sb.from("products").select("id", { count: "exact", head: true }),
      sb.from("orders").select("id", { count: "exact", head: true }),
      sb.storage.listBuckets(),
    ]);

    if (productsRes.error) {
      throw new Error(`products query failed: ${productsRes.error.message}`);
    }
    if (ordersRes.error) {
      throw new Error(`orders query failed: ${ordersRes.error.message}`);
    }
    if (bucketsRes.error) {
      throw new Error(`storage listBuckets failed: ${bucketsRes.error.message}`);
    }

    return NextResponse.json(
      {
        ok: true,
        service: "supabase-keep-alive",
        timestamp: new Date().toISOString(),
        db: "active",
        storage: "active",
        counts: {
          products: productsRes.count ?? 0,
          orders: ordersRes.count ?? 0,
          buckets: bucketsRes.data?.length ?? 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Supabase keep-alive failed:", error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const POST = GET;
