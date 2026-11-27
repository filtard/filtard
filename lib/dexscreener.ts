import { dexFetch } from "@/lib/dex-fetch";

export type TokenStats = {
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
export async function getTokenStatsBatch(
  tokens: TokenInput[],
  revalidate = 30
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
        const url = `/tokens/v1/${chain}/${chunk.join(",")}`;

        try {
          const res = await dexFetch(url, {
            next: { revalidate },
          });

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
          const res = await dexFetch(
            `/latest/dex/tokens/${t.address}`,
            { next: { revalidate } }
          );
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

export type DexTokenMeta = {
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  marketCap: number | null;
};

const emptyDexTokenMeta: DexTokenMeta = {
  name: null,
  symbol: null,
  imageUrl: null,
  marketCap: null,
};

export async function getDexTokenMeta(address: string): Promise<DexTokenMeta> {
  const trimmed = address.trim();
  if (!trimmed) return emptyDexTokenMeta;

  try {
    const res = await dexFetch(
      `/latest/dex/tokens/${encodeURIComponent(trimmed)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return emptyDexTokenMeta;

    const data = await res.json();
    const pair = Array.isArray(data?.pairs) ? data.pairs[0] : null;
    if (!pair) return emptyDexTokenMeta;

    const rawCap = pair.marketCap ?? pair.fdv ?? null;
    const marketCap = rawCap != null ? Number(rawCap) : null;

    return {
      name: pair.baseToken?.name || null,
      symbol: pair.baseToken?.symbol || null,
      imageUrl: pair.info?.imageUrl || null,
      marketCap: marketCap != null && Number.isFinite(marketCap) ? marketCap : null,
    };
  } catch {
    return emptyDexTokenMeta;
  }
}