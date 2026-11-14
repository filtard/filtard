import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import Link from "next/link";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "Performance",
  description: "PnL since listing on Filtard.",
  openGraph: {
    title: "Performance | Filtard",
    description: "PnL since listing on Filtard.",
    url: `${siteUrl}/performance`,
    siteName: "Filtard",
  },
};

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

type Winner = TokenRow & {
  currentMcap: number;
  initialMcap: number;
  pnl: number;
  thesisSnippet: string;
};

function formatUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function truncate(text: string | null, max = 110) {
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
        market_cap
      )
    `
    )
    .eq("status", "approved")
    .not("initial_mcap", "is", null);

  if (error) {
    console.error("performance page query error:", error.message);
  }

  const rows = (data || []) as TokenRow[];

  const winners: Winner[] = rows
    .map((t): Winner | null => {
      const stats = Array.isArray(t.token_stats) ? t.token_stats[0] : t.token_stats;
      const currentMcap = stats?.market_cap != null ? Number(stats.market_cap) : null;
      const initialMcap = t.initial_mcap != null ? Number(t.initial_mcap) : null;

      if (!initialMcap || initialMcap <= 0 || !currentMcap) return null;

      const pnl = ((currentMcap - initialMcap) / initialMcap) * 100;
      if (!Number.isFinite(pnl) || pnl <= 0) return null;

      return {
        ...t,
        currentMcap,
        initialMcap,
        pnl,
        thesisSnippet: truncate(t.thesis),
      };
    })
    .filter((t): t is Winner => t !== null)
    .sort((a, b) => b.pnl - a.pnl);

  return (
    <div className="w-full px-3 md:px-6 py-6 md:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Performance</h1>
        <p className="text-sm text-[#8b93a1] mt-1">
          PnL since listing on Filtard.
        </p>
      </div>

      {winners.length === 0 ? (
        <p className="text-[#8b93a1]">No positive performers yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 justify-items-center">
          {winners.map((t) => (
            <Link
              key={t.id}
              href={`/${t.chain}/${t.address}`}
              className="relative block w-full max-w-[320px] rounded-2xl border border-[#1c1f26] bg-[#07080a] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:border-[#2a2e36] transition-all"
            >
              {/* Subtle layered backdrop */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
              <div className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] pointer-events-none" />

              <div className="relative">
                {/* Top right brand */}
                <div className="flex justify-end mb-3">
                  <div className="flex items-center gap-1.5">
                    <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
                    <span className="text-xs font-semibold tracking-wide text-[#c8cdd6]">Filtard</span>
                  </div>
                </div>

                {/* Token identity */}
                <div className="flex items-center gap-3 mb-5">
                  {t.image_url ? (
                    <img
                      src={t.image_url}
                      alt=""
                      className="h-11 w-11 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-[#1c1f26] flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-base leading-tight truncate">
                      {t.name || "Unknown"}
                    </div>
                    <div className="text-sm text-[#8b93a1]">${t.symbol}</div>
                  </div>
                </div>

                {/* Big percentage */}
                <div className="text-center mb-5">
                  <div className="text-5xl font-bold text-[#22c55e] leading-none">
                    +{Math.round(t.pnl)}%
                  </div>
                  <div className="text-xs text-[#6b7280] mt-2">
                    PnL since listing on Filtard.
                  </div>
                </div>

                {/* Before / After with center divider + arrow */}
                <div className="relative border-t border-[#1c1f26] pt-4">
                  <div className="flex">
                    {/* Before */}
                    <div className="flex-1 pr-5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">Before</span>
                      </div>
                      <div className="text-xs text-[#8b93a1]">Mcap</div>
                      <div className="text-base font-medium mt-0.5">{formatUsd(t.initialMcap)}</div>
                    </div>

                    {/* After */}
                    <div className="flex-1 pl-5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                        <span className="text-[10px] text-[#22c55e] uppercase tracking-wider">After</span>
                      </div>
                      <div className="text-xs text-[#8b93a1]">Mcap</div>
                      <div className="text-base font-medium text-[#22c55e] mt-0.5">
                        {formatUsd(t.currentMcap)}
                      </div>
                    </div>
                  </div>

                  {/* Center vertical divider */}
                  <div className="absolute left-1/2 top-4 bottom-0 w-px bg-[#1c1f26] -translate-x-1/2" />

                  {/* Arrow perfectly on the divider */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mt-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2a2e36] bg-[#0d0f12] text-[#8b93a1] shadow-sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Thesis */}
                {t.thesisSnippet && (
                  <div className="mt-4 pt-3 border-t border-[#1c1f26]">
                    <div className="text-[10px] text-[#22c55e] uppercase tracking-wider mb-1.5">Thesis</div>
                    <p className="text-sm text-[#c8cdd6] leading-snug line-clamp-3">
                      {t.thesisSnippet}
                    </p>
                  </div>
                )}

                {/* Domain footer */}
                <div className="mt-4 text-[10px] text-[#4b5563] text-center tracking-wide">
                  filtard.com
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
