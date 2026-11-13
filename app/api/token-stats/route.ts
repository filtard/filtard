import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Data only changes when the stats cron runs (once a minute), so let the CDN
// serve one copy to every open tab.
export const revalidate = 30;

const CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=60";

type StatsRow = {
  token_id: string;
  price_usd: number | string | null;
  change_24h: number | string | null;
  volume_24h: number | string | null;
  liquidity: number | string | null;
  market_cap: number | string | null;
  txns_24h: number | string | null;
  pair_created_at: number | string | null;
};

function num(value: number | string | null): number | null {
  return value != null ? Number(value) : null;
}

export async function GET() {
  const { data: rows, error } = await supabase
    .from("token_stats")
    .select(
      "token_id, price_usd, change_24h, volume_24h, liquidity, market_cap, txns_24h, pair_created_at, tokens!inner(status)"
    )
    .eq("tokens.status", "approved");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const stats: Record<
    string,
    {
      priceUsd: number | null;
      change24h: number | null;
      volume24h: number | null;
      liquidity: number | null;
      marketCap: number | null;
      txns24h: number | null;
      pairCreatedAt: number | null;
    }
  > = {};

  for (const row of (rows || []) as StatsRow[]) {
    stats[row.token_id] = {
      priceUsd: num(row.price_usd),
      change24h: num(row.change_24h),
      volume24h: num(row.volume_24h),
      liquidity: num(row.liquidity),
      marketCap: num(row.market_cap),
      txns24h: num(row.txns_24h),
      pairCreatedAt: num(row.pair_created_at),
    };
  }

  return NextResponse.json(
    { stats },
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
