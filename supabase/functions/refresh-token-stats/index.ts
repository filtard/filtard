// Refreshes token_stats from DexScreener. Called every minute by pg_cron
// (job 5). Runs on Supabase instead of the Cloudflare Worker because
// DexScreener rate limits shared Worker egress IPs.
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json" },
  });
}

type TokenStats = {
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  txns24h: number | null;
  pairCreatedAt: number | null;
};

type TokenInput = {
  chain: string;
  address: string;
};

function makeKey(chain: string, address: string) {
  return `${chain.toLowerCase()}:${address.toLowerCase()}`;
}

function extractStats(pair: any): TokenStats {
  return {
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    change24h: pair.priceChange?.h24 ?? null,
    volume24h: pair.volume?.h24 ?? null,
    liquidity: pair.liquidity?.usd ?? null,
    marketCap: pair.marketCap ?? pair.fdv ?? null,
    txns24h:
      (pair.txns?.h24?.buys ?? 0) + (pair.txns?.h24?.sells ?? 0) || null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
  };
}

/**
 * Batch-fetch stats from DexScreener.
 * 1. Try the official v1 batch endpoint (grouped by chain, max 30).
 * 2. For any tokens still missing, fall back to the reliable single-token endpoint.
 */
async function getTokenStatsBatch(
  tokens: TokenInput[],
  _revalidate = 30
): Promise<Map<string, TokenStats | null>> {
  const result = new Map<string, TokenStats | null>();

  if (!tokens.length) return result;

  // Group by chain
  const byChain = new Map<string, string[]>();
  for (const t of tokens) {
    const chain = t.chain.toLowerCase();
    const addr = t.address;
    if (!byChain.has(chain)) byChain.set(chain, []);
    byChain.get(chain)!.push(addr);
    result.set(makeKey(chain, addr), null);
  }

  const CHUNK = 30;

  // --- Pass 1: batch v1 endpoint ---
  await Promise.all(
    Array.from(byChain.entries()).map(async ([chain, addresses]) => {
      const unique = [...new Set(addresses.map((a) => a))];

      for (let i = 0; i < unique.length; i += CHUNK) {
        const chunk = unique.slice(i, i + CHUNK);
        const url = `https://api.dexscreener.com/tokens/v1/${chain}/${chunk.join(",")}`;

        try {
          const res = await fetch(url);

          if (!res.ok) continue;

          const pairs: any[] = await res.json();
          if (!Array.isArray(pairs)) continue;

          const bestByAddress = new Map<string, any>();

          for (const pair of pairs) {
            const baseAddr = (pair.baseToken?.address || "").toLowerCase();
            if (!baseAddr) continue;

            const existing = bestByAddress.get(baseAddr);
            const liq = pair.liquidity?.usd ?? 0;
            if (!existing || liq > (existing.liquidity?.usd ?? 0)) {
              bestByAddress.set(baseAddr, pair);
            }
          }

          for (const [addr, pair] of bestByAddress) {
            result.set(makeKey(chain, addr), extractStats(pair));
          }
        } catch {
          // leave as null
        }
      }
    })
  );

  // --- Pass 2: fallback for any still-null tokens ---
  const missing = tokens.filter(
    (t) => result.get(makeKey(t.chain, t.address)) == null
  );

  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (t) => {
        try {
          const res = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${t.address}`);
          if (!res.ok) return;

          const data = await res.json();
          const pairs: any[] = data?.pairs || [];
          if (!pairs.length) return;

          // Prefer pair on the requested chain, otherwise highest liquidity
          const onChain = pairs.filter(
            (p) => (p.chainId || "").toLowerCase() === t.chain.toLowerCase()
          );
          const candidates = onChain.length ? onChain : pairs;

          candidates.sort(
            (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
          );

          const best = candidates[0];
          if (best) {
            result.set(makeKey(t.chain, t.address), extractStats(best));
          }
        } catch {
          // leave as null
        }
      })
    );
  }

  return result;
}


Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("id, chain, address")
      .eq("status", "approved");

    if (tokensError) {
      console.error("tokens fetch error:", tokensError);
      return json({ error: tokensError.message }, { status: 500 });
    }

    if (!tokens || tokens.length === 0) {
      return json({ updated: 0, message: "No approved tokens" });
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
      return json({
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
      return json({ error: upsertError.message }, { status: 500 });
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

    return json(summary);
  } catch (err: any) {
    console.error("cron refresh error:", err);
    return json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
});
