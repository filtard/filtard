import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CopyButton from "@/app/copy-button";
import { supabase } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import Link from "next/link";
import StarRating from "@/app/components/StarRating";
import WatchlistStar from "@/app/components/WatchlistStar";
import ThesisCard from "@/app/components/ThesisCard";
import ViewTracker from "@/app/components/ViewTracker";
import DexChartEmbed from "@/app/components/DexChartEmbed";
import TokenLiveStats from "@/app/components/TokenLiveStats";

export const revalidate = 20;

type LiveStats = {
  name: string;
  symbol: string;
  imageUrl: string | null;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  pairAddress: string | null;
  dexChain: string | null;
  websites: any[];
  socials: any[];
};

async function getTokenStats(address: string): Promise<LiveStats | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { next: { revalidate: 20 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (!pair) return null;

    return {
      name: pair.baseToken?.name || "Unknown",
      symbol: pair.baseToken?.symbol || "???",
      imageUrl: pair.info?.imageUrl || null,
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
      change24h: pair.priceChange?.h24 ?? null,
      volume24h: pair.volume?.h24 ?? null,
      liquidity: pair.liquidity?.usd ?? null,
      marketCap: pair.marketCap ?? pair.fdv ?? null,
      pairAddress: pair.pairAddress || null,
      dexChain: pair.chainId || null,
      websites: pair.info?.websites || [],
      socials: pair.info?.socials || [],
    };
  } catch {
    return null;
  }
}

async function getTokenFromDb(chain: string, address: string) {
  let { data } = await supabase
    .from("tokens")
    .select(
      `
      id,
      chain,
      address,
      name,
      symbol,
      image_url,
      status,
      submitted_by,
      thesis,
      confidence,
      thesis_updated_at,
      thesis_updated_by,
      token_stats (
        price_usd,
        change_24h,
        volume_24h,
        liquidity,
        market_cap
      ),
      profiles!submitted_by (
        id,
        display_name,
        avatar_url,
        role
      )
    `
    )
    .eq("chain", chain.toLowerCase())
    .ilike("address", address)
    .maybeSingle();

  if (!data) {
    const result = await supabase
      .from("tokens")
      .select(
        `
        id,
        chain,
        address,
        name,
        symbol,
        image_url,
        status,
        submitted_by,
        thesis,
        confidence,
        thesis_updated_at,
        thesis_updated_by,
        token_stats (
          price_usd,
          change_24h,
          volume_24h,
          liquidity,
          market_cap
        ),
        profiles!submitted_by (
          id,
          display_name,
          avatar_url,
          role
        )
      `
      )
      .ilike("address", address)
      .maybeSingle();

    data = result.data;
  }

  return data;
}

async function getTokenRatings(tokenId: string) {
  const { data } = await supabase
    .from("ratings")
    .select("stars")
    .eq("token_id", tokenId);

  if (!data || data.length === 0) {
    return { average: 0, count: 0 };
  }

  const sum = data.reduce((acc, r) => acc + r.stars, 0);
  const average = Number((sum / data.length).toFixed(1));

  return { average, count: data.length };
}

async function getViewCount(tokenId: string) {
  const { count } = await supabase
    .from("token_views")
    .select("*", { count: "exact", head: true })
    .eq("token_id", tokenId);

  return count || 0;
}

async function getThesisEditor(userId: string | null) {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

function formatUsd(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(4)}`;
}

function formatPct(n: number | null) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}): Promise<Metadata> {
  const { chain, address } = await params;

  const [stats, dbToken] = await Promise.all([
    getTokenStats(address),
    getTokenFromDb(chain, address),
  ]);

  const symbol = stats?.symbol || dbToken?.symbol || "???";
  const name = stats?.name || dbToken?.name || "Unknown";

  const cached = Array.isArray(dbToken?.token_stats)
    ? dbToken?.token_stats[0]
    : dbToken?.token_stats;

  const priceUsd =
    stats?.priceUsd ??
    (cached?.price_usd != null ? Number(cached.price_usd) : null);
  const change24h =
    stats?.change24h ??
    (cached?.change_24h != null ? Number(cached.change_24h) : null);
  const marketCap =
    stats?.marketCap ??
    (cached?.market_cap != null ? Number(cached.market_cap) : null);

  const image = stats?.imageUrl || dbToken?.image_url || null;
  const rawThesis = dbToken?.thesis || null;

  const curatorProfile = Array.isArray(dbToken?.profiles)
    ? dbToken.profiles[0]
    : dbToken?.profiles;
  const curator = curatorProfile?.display_name || null;

  function toPlainText(text: string): string {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const plainThesis = rawThesis ? toPlainText(rawThesis) : null;

  const siteUrl = getSiteUrl();
  const domain = siteUrl.replace(/^https?:\/\//, "");

  const ogParams = new URLSearchParams({
    symbol,
    name,
    domain,
  });
  if (priceUsd != null) ogParams.set("price", String(priceUsd));
  if (change24h != null) ogParams.set("change", String(change24h));
  if (marketCap != null) ogParams.set("mcap", String(marketCap));
  if (image) ogParams.set("image", image);
  if (curator) ogParams.set("curator", curator);

  const ogImageUrl = `${siteUrl}/api/og?${ogParams.toString()}`;

  const title = `$${symbol}`;
  const description = plainThesis
    ? plainThesis.length > 160
      ? plainThesis.slice(0, 157) + "..."
      : plainThesis
    : `${name} (${symbol}) — Community curated on Filtard`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Filtard`,
      description,
      url: `${siteUrl}/${chain}/${address}`,
      siteName: "Filtard",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${symbol} on Filtard`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Filtard`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  const { chain, address } = await params;

  const [liveStats, dbToken] = await Promise.all([
    getTokenStats(address),
    getTokenFromDb(chain, address),
  ]);

  if (!dbToken && !liveStats) {
    notFound();
  }

  const cached = Array.isArray(dbToken?.token_stats)
    ? dbToken?.token_stats[0]
    : dbToken?.token_stats;

  const stats = {
    name: liveStats?.name || dbToken?.name || "Unknown",
    symbol: liveStats?.symbol || dbToken?.symbol || "???",
    imageUrl: liveStats?.imageUrl || dbToken?.image_url || null,
    priceUsd:
      liveStats?.priceUsd ??
      (cached?.price_usd != null ? Number(cached.price_usd) : null),
    change24h:
      liveStats?.change24h ??
      (cached?.change_24h != null ? Number(cached.change_24h) : null),
    volume24h:
      liveStats?.volume24h ??
      (cached?.volume_24h != null ? Number(cached.volume_24h) : null),
    liquidity:
      liveStats?.liquidity ??
      (cached?.liquidity != null ? Number(cached.liquidity) : null),
    marketCap:
      liveStats?.marketCap ??
      (cached?.market_cap != null ? Number(cached.market_cap) : null),
    pairAddress: liveStats?.pairAddress || null,
    dexChain: liveStats?.dexChain || null,
    websites: liveStats?.websites || [],
    socials: liveStats?.socials || [],
  };

  const [ratings, viewCount, editor] = await Promise.all([
    dbToken?.id
      ? getTokenRatings(dbToken.id)
      : Promise.resolve({ average: 0, count: 0 }),
    dbToken?.id ? getViewCount(dbToken.id) : Promise.resolve(0),
    dbToken?.thesis_updated_by
      ? getThesisEditor(dbToken.thesis_updated_by)
      : Promise.resolve(null),
  ]);

  const chartChain = stats.dexChain || chain;
  const embedUrl = stats.pairAddress
    ? `https://dexscreener.com/${chartChain}/${stats.pairAddress}?embed=1&theme=dark&trades=0&info=0`
    : `https://dexscreener.com/${chartChain}/${address}?embed=1&theme=dark&trades=0&info=0`;

  const socialLinks: { type: string; url: string }[] = [];

  if (stats.websites?.length) {
    stats.websites.forEach((w: any) => {
      if (w.url) socialLinks.push({ type: "website", url: w.url });
    });
  }

  if (stats.socials?.length) {
    stats.socials.forEach((s: any) => {
      if (s.url)
        socialLinks.push({ type: s.type || s.platform || "social", url: s.url });
    });
  }

  const curator = Array.isArray(dbToken?.profiles)
    ? dbToken.profiles[0]
    : dbToken?.profiles;

  const imageUrl = stats.imageUrl || dbToken?.image_url || null;

  return (
    <div className="w-full px-4 sm:px-6">
      {dbToken?.id && <ViewTracker tokenId={dbToken.id} />}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-center gap-5 lg:gap-6 mb-6">
        <div className="flex justify-center lg:justify-start">
          <div className="flex items-center gap-4">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-12 w-12 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-[#1c1f26] flex-shrink-0" />
            )}

            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <div className="text-xl font-semibold truncate">{stats.symbol}</div>
                {dbToken?.id && <WatchlistStar tokenId={dbToken.id} />}
              </div>
              <p className="text-sm text-[#8b93a1] truncate">{stats.name}</p>

              {curator && curator.display_name && (
                <p className="text-sm text-[#8b93a1] mt-1 flex flex-wrap items-center gap-2">
                  <span>
                    Curated by{" "}
                    <Link
                      href={`/${curator.display_name}`}
                      className="text-[#b8ff3d] hover:underline"
                    >
                      {curator.display_name}
                    </Link>
                    <VerifiedBadge role={curator.role} />
                  </span>
                </p>
              )}

              {dbToken?.id && (
                <div className="mt-2">
                  <StarRating
                    tokenId={dbToken.id}
                    initialAverage={ratings.average}
                    initialCount={ratings.count}
                    userRating={null}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm w-full lg:w-auto lg:flex-row lg:flex-wrap lg:items-stretch">
          <div className="grid grid-cols-3 gap-2 lg:contents">
            <TokenLiveStats
              address={address}
              initial={{
                priceUsd: stats.priceUsd,
                change24h: stats.change24h,
                volume24h: stats.volume24h,
                liquidity: stats.liquidity,
                marketCap: stats.marketCap,
              }}
            />

            <div className="rounded-lg border border-[#1c1f26] bg-[#101215] px-3 py-2 min-w-0 lg:flex-none lg:min-w-[80px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#8b93a1]">CA</span>
                <CopyButton text={address} />
              </div>
            </div>
          </div>

          {socialLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:flex-none">
              {socialLinks.map((link, i) => {
                const type = link.type.toLowerCase();
                let icon = null;

                if (type.includes("twitter") || type.includes("x")) {
                  icon = (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  );
                } else if (type.includes("telegram")) {
                  icon = (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.36-.49.99-.75 3.89-1.69 6.49-2.81 7.79-3.35 3.72-1.54 4.49-1.81 4.99-1.82.11 0 .35.03.51.14.13.09.17.21.19.3-.01.06.01.24 0 .38z" />
                    </svg>
                  );
                } else {
                  icon = (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  );
                }

                return (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-[#1c1f26] bg-[#101215] text-[#8b93a1] hover:text-white hover:bg-[#1c1f26] transition"
                  >
                    {icon}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ThesisCard
        tokenId={dbToken?.id || null}
        initialThesis={dbToken?.thesis || null}
        submittedBy={dbToken?.submitted_by || null}
        symbol={stats.symbol}
        name={stats.name}
        initialConfidence={dbToken?.confidence ?? null}
        thesisUpdatedAt={dbToken?.thesis_updated_at || null}
        thesisUpdatedByName={editor?.display_name || null}
        thesisUpdatedByDisplay={editor?.display_name || null}
        thesisUpdatedByRole={editor?.role || null}
        viewCount={viewCount}
      />

      <DexChartEmbed embedUrl={embedUrl} height={520} />
    </div>
  );
}