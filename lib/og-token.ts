import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";

export type OgTokenData = {
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
};

const OG_VERSION_MS = 60 * 60 * 1000;

/** Changes once per hour so share image links stay cacheable. */
export function ogVersion(now = Date.now()): string {
  return String(Math.floor(now / OG_VERSION_MS));
}

export function tokenOgImageUrl(
  siteUrl: string,
  chain: string,
  address: string
): string {
  const params = new URLSearchParams({
    chain: chain.toLowerCase(),
    address,
    v: ogVersion(),
  });
  return `${siteUrl}/api/og?${params.toString()}`;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadOgTokenData(
  chain: string,
  address: string
): Promise<OgTokenData | null> {
  const { data } = await supabase
    .from("tokens")
    .select(
      "symbol, name, image_url, token_stats ( price_usd, change_24h, market_cap )"
    )
    .eq("chain", chain)
    .ilike("address", address)
    .maybeSingle();

  if (data) {
    const s = Array.isArray(data.token_stats)
      ? data.token_stats[0]
      : data.token_stats;
    return {
      symbol: data.symbol ?? null,
      name: data.name ?? null,
      imageUrl: data.image_url ?? null,
      priceUsd: toNumber(s?.price_usd),
      change24h: toNumber(s?.change_24h),
      marketCap: toNumber(s?.market_cap),
    };
  }

  // Not listed on Filtard: fall back to DexScreener (cached for an hour).
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const pair = Array.isArray(json?.pairs) ? json.pairs[0] : null;
    if (!pair) return null;
    return {
      symbol: pair.baseToken?.symbol ?? null,
      name: pair.baseToken?.name ?? null,
      imageUrl: pair.info?.imageUrl ?? null,
      priceUsd: toNumber(pair.priceUsd),
      change24h: toNumber(pair.priceChange?.h24),
      marketCap: toNumber(pair.marketCap ?? pair.fdv),
    };
  } catch {
    return null;
  }
}

export const getOgTokenData = unstable_cache(loadOgTokenData, ["og-token"], {
  revalidate: 3600,
});
