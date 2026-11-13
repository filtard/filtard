import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenStatsBatch } from "@/lib/dexscreener";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("id, chain, address")
      .eq("status", "approved");

    if (tokensError) {
      console.error("tokens fetch error:", tokensError);
      return NextResponse.json({ error: tokensError.message }, { status: 500 });
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ updated: 0, message: "No approved tokens" });
    }

    const statsMap = await getTokenStatsBatch(
      tokens.map((t) => ({ chain: t.chain, address: t.address })),
      0
    );

    const now = new Date().toISOString();
    let keptPreviousCount = 0;
    const missingAddresses: string[] = [];
    const partialIds: string[] = [];

    type StatsRow = {
      token_id: string;
      price_usd: number | null;
      change_24h: number | null;
      volume_24h: number | null;
      liquidity: number | null;
      market_cap: number | null;
      txns_24h: number | null;
      pair_created_at: number | null;
      updated_at: string;
    };

    // Only tokens DexScreener returned data for are written. Tokens with no
    // fresh data keep their previous row untouched, so the full token_stats
    // read is no longer needed.
    const rows: StatsRow[] = [];
    for (const t of tokens) {
      const key = `${t.chain.toLowerCase()}:${t.address.toLowerCase()}`;
      const fresh = statsMap.get(key);
      const gotFresh = fresh?.priceUsd != null || fresh?.marketCap != null;
      if (!fresh || !gotFresh) {
        keptPreviousCount += 1;
        missingAddresses.push(`${t.chain}:${t.address}`);
        continue;
      }

      const row: StatsRow = {
        token_id: t.id,
        price_usd: fresh.priceUsd,
        change_24h: fresh.change24h,
        volume_24h: fresh.volume24h,
        liquidity: fresh.liquidity,
        market_cap: fresh.marketCap,
        txns_24h: fresh.txns24h,
        pair_created_at: fresh.pairCreatedAt,
        updated_at: now,
      };
      if (Object.values(row).some((value) => value == null)) {
        partialIds.push(t.id);
      }
      rows.push(row);
    }

    // Some fields can come back empty; keep the previous values for those.
    // Only the few partial rows are read, with just the columns needed.
    if (partialIds.length > 0) {
      const { data: previous } = await supabase
        .from("token_stats")
        .select(
          "token_id, price_usd, change_24h, volume_24h, liquidity, market_cap, txns_24h, pair_created_at"
        )
        .in("token_id", partialIds);

      const prevMap = new Map(
        (previous || []).map((row) => [row.token_id as string, row])
      );
      const fields = [
        "price_usd",
        "change_24h",
        "volume_24h",
        "liquidity",
        "market_cap",
        "txns_24h",
        "pair_created_at",
      ] as const;

      for (const row of rows) {
        const prev = prevMap.get(row.token_id);
        if (!prev) continue;
        for (const field of fields) {
          if (row[field] == null && prev[field] != null) {
            row[field] = prev[field];
          }
        }
      }
    }

    const freshCount = rows.length;

    if (rows.length === 0) {
      console.warn("cron refresh: no fresh Dex data for any token");
      return NextResponse.json({
        updated: 0,
        freshFromDex: 0,
        keptPrevious: keptPreviousCount,
        missingSample: missingAddresses.slice(0, 10),
      });
    }

    const { error: upsertError } = await supabase
      .from("token_stats")
      .upsert(rows, { onConflict: "token_id" });

    if (upsertError) {
      console.error("upsert error:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const summary = {
      updated: rows.length,
      freshFromDex: freshCount,
      keptPrevious: keptPreviousCount,
      missingSample: missingAddresses.slice(0, 10),
      message: "token_stats refreshed (null-safe)",
    };

    if (keptPreviousCount > 0) {
      console.warn(
        `cron refresh: ${keptPreviousCount}/${tokens.length} tokens had no fresh Dex data`,
        missingAddresses.slice(0, 10)
      );
    }

    return NextResponse.json(summary);
  } catch (err: any) {
    console.error("cron refresh error:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}