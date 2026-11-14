import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import Link from "next/link";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "Performance",
  description: "PnL since listing on Filtard. Winners only.",
  openGraph: {
    title: "Performance | Filtard",
    description: "PnL since listing on Filtard. Winners only.",
    url: `${siteUrl}/performance`,
    siteName: "Filtard",
  },
};

// Long ISR so Vercel CPU stays low. Page is cheap to render.
export const revalidate = 300;

type TokenRow = {
  id: string;
  chain: string;
  address: string;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  thesis: string | null;
  initial_mcap: number | null;
  approved_at: string | null;
  token_stats: { market_cap: number | null; price_usd: number | null }[] | { market_cap: number | null; price_usd: number | null } | null;
};

function formatUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function truncate(text: string | null, max = 140) {
  if (!text) return "";
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max - 1).trim() + "…";
}

export default async function PerformancePage() {
  const { data, error } = await supabase
    .from("tokens")
    .select(
      `
      id,
      chain,
      address,
      name,
      symbol,
      image_url,
      thesis,
      initial_mcap,
      approved_at,
      token_stats (
        market_cap,
        price_usd
      )
    `
    )
    .eq("status", "approved")
    .not("initial_mcap", "is", null);

  if (error) {
    console.error("performance page query error:", error.message);
  }

  const rows = (data || []) as TokenRow[];

  const winners = rows
    .map((t) => {
      const stats = Array.isArray(t.token_stats) ? t.token_stats[0] : t.token_stats;
      const currentMcap = stats?.market_cap != null ? Number(stats.market_cap) : null;
      const initialMcap = t.initial_mcap != null ? Number(t.initial_mcap) : null;
      const currentPrice = stats?.price_usd != null ? Number(stats.price_usd) : null;

      if (!initialMcap || initialMcap <= 0 || !currentMcap) return null;

      const pnl = ((currentMcap - initialMcap) / initialMcap) * 100;
      if (!Number.isFinite(pnl) || pnl <= 0) return null;

      return {
        ...t,
        currentMcap,
        initialMcap,
        currentPrice,
        pnl,
        thesisSnippet: truncate(t.thesis),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.pnl - a!.pnl)) as NonNullable<typeof winners[number]>[];

  return (
    <div className="w-full px-3 md:px-6 py-6 md:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Performance</h1>
        <p className="text-sm text-[#8b93a1] mt-1">
          PnL since listing on Filtard. Winners only.
        </p>
      </div>

      {winners.length === 0 ? (
        <p className="text-[#8b93a1]">No positive performers yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {winners.map((t) => (
            <Link
              key={t.id}
              href={`/${t.chain}/${t.address}`}
              className="block rounded-2xl border border-[#1c1f26] bg-[#0d0f12] p-5 hover:border-[#2a2e36] transition"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/logo.png"
                  alt=""
                  className="h-7 w-7 rounded-md object-contain"
                />
                <div className="text-sm font-medium text-[#8b93a1]">Filtard</div>
              </div>

              {/* Token */}
              <div className="flex items-center gap-3 mb-5">
                {t.image_url ? (
                  <img
                    src={t.image_url}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-[#1c1f26]" />
                )}
                <div>
                  <div className="font-semibold text-lg leading-tight">
                    {t.name || t.symbol || "Unknown"}
                  </div>
                  <div className="text-sm text-[#8b93a1]">${t.symbol}</div>
                </div>
              </div>

              {/* Big PnL */}
              <div className="text-center mb-5">
                <div className="text-5xl font-bold text-[#22c55e]">
                  +{t.pnl.toFixed(0)}%
                </div>
                <div className="text-xs text-[#6b7280] tracking-wider mt-1">
                  PNL SINCE LISTING ON FILTARD
                </div>
              </div>

              {/* Before / After */}
              <div className="grid grid-cols-2 gap-4 border-t border-[#1c1f26] pt-4 mb-4">
                <div>
                  <div className="text-[11px] text-[#6b7280] uppercase tracking-wider mb-1">
                    Before
                  </div>
                  <div className="text-xs text-[#8b93a1]">Mcap</div>
                  <div className="font-medium">{formatUsd(t.initialMcap)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#6b7280] uppercase tracking-wider mb-1">
                    After
                  </div>
                  <div className="text-xs text-[#8b93a1]">Mcap</div>
                  <div className="font-medium text-[#22c55e]">
                    {formatUsd(t.currentMcap)}
                  </div>
                  {t.currentPrice != null && (
                    <>
                      <div className="text-xs text-[#8b93a1] mt-2">Price</div>
                      <div className="font-medium text-[#22c55e]">
                        {formatUsd(t.currentPrice)}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Thesis */}
              {t.thesisSnippet && (
                <div className="border-t border-[#1c1f26] pt-3">
                  <div className="text-[11px] text-[#22c55e] uppercase tracking-wider mb-1">
                    Thesis
                  </div>
                  <p className="text-sm text-[#c8cdd6] leading-snug">
                    {t.thesisSnippet}
                  </p>
                </div>
              )}

              {/* Footer domain */}
              <div className="mt-4 text-[10px] text-[#4b5563] text-center">
                filtard.com
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
