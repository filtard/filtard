import { supabase } from "@/lib/supabase";
import Link from "next/link";
import type { Metadata } from "next";
import VerifiedBadge from "@/app/components/VerifiedBadge";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://filtard.com";
const ogImage = `${siteUrl}/api/og/site`;

export const metadata: Metadata = {
  title: "Curator leaderboard",
  description: "Join the curator economy. Submit your highest conviction memecoins, earn points, and climb the leaderboard.",
  openGraph: {
    title: "Curator leaderboard",
    description: "Join the curator economy. Submit your highest conviction memecoins, earn points, and climb the leaderboard.",
    url: `${siteUrl}/leaderboard`,
    siteName: "Filtard",
    type: "website",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Filtard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Curator leaderboard",
    description: "Join the curator economy. Submit your highest conviction memecoins, earn points, and climb the leaderboard.",
    images: [ogImage],
  },
};

export const revalidate = 60;

type CuratorScore = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  role: string | null;
  tokens: number;
  multiplier: number;
  points: number;
};

async function getLeaderboard(): Promise<CuratorScore[]> {
  const { data: tokens } = await supabase
    .from("tokens")
    .select(
      `
      id,
      chain,
      address,
      submitted_by,
      initial_mcap,
      token_stats (
        market_cap
      )
    `
    )
    .eq("status", "approved")
    .not("submitted_by", "is", null);

  if (!tokens || tokens.length === 0) return [];

  const byCurator: Record<
    string,
    { initial_mcap: number | null; market_cap: number | null }[]
  > = {};

  tokens.forEach((t) => {
    if (!t.submitted_by) return;
    if (!byCurator[t.submitted_by]) byCurator[t.submitted_by] = [];

    const s = Array.isArray(t.token_stats) ? t.token_stats[0] : t.token_stats;

    byCurator[t.submitted_by].push({
      initial_mcap: t.initial_mcap,
      market_cap: s?.market_cap != null ? Number(s.market_cap) : null,
    });
  });

  const curatorIds = Object.keys(byCurator);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, twitter_url, telegram_url, role")
    .in("id", curatorIds);

  if (!profiles) return [];

  const scores: CuratorScore[] = [];

  for (const profile of profiles) {
    const curatorTokens = byCurator[profile.id] || [];
    const tokenCount = curatorTokens.length;
    if (tokenCount === 0) continue;

    const multipliers = curatorTokens.map((t) => {
      const current = t.market_cap;
      const initial = t.initial_mcap;
      if (!current || !initial || initial <= 0) return 1;
      const raw = current / initial;
      return Math.min(10, Math.max(1, raw));
    });

    const avgMultiplier =
      multipliers.reduce((sum, m) => sum + m, 0) / multipliers.length;

    const points = tokenCount * 10 * avgMultiplier;

    scores.push({
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      twitter_url: profile.twitter_url,
      telegram_url: profile.telegram_url,
      role: profile.role ?? null,
      tokens: tokenCount,
      multiplier: Number(avgMultiplier.toFixed(2)),
      points: Math.round(points),
    });
  }

  return scores.sort((a, b) => b.points - a.points);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-300/20 text-gray-300 text-xs font-bold">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-600 text-xs font-bold">
        3
      </span>
    );
  }
  return (
    <span className="text-[#8b93a1] text-sm tabular-nums w-6 text-center">
      {rank}
    </span>
  );
}

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          Curator Leaderboard
        </h1>
        <p className="text-sm text-[#8b93a1] mt-1.5">
          Earn FTD points based on the number of tokens submitted and their
          performance
        </p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="border border-[#1c1f26] rounded-2xl p-16 text-center text-[#8b93a1]">
          No curators yet
        </div>
      ) : (
        <>
          <div className="border border-[#1c1f26] rounded-2xl overflow-x-auto">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="bg-[#0c0d10] border-b border-[#1c1f26] text-xs text-[#8b93a1] tracking-wide">
                  <th className="px-3 md:px-4 py-3 font-normal text-center whitespace-nowrap">Rank</th>
                  <th className="px-3 md:px-4 py-3 font-normal text-left whitespace-nowrap">Curator</th>
                  <th className="px-3 md:px-4 py-3 font-normal text-center whitespace-nowrap">Tokens</th>
                  <th className="px-3 md:px-4 py-3 font-normal text-center whitespace-nowrap">Points</th>
                  <th className="px-3 md:px-4 py-3 font-normal text-center whitespace-nowrap">
                    <span className="md:hidden">X</span>
                    <span className="hidden md:inline">Multiplier</span>
                  </th>
                  <th className="px-3 md:px-4 py-3 font-normal text-right whitespace-nowrap">Socials</th>
                </tr>
              </thead>
              <tbody>
              {leaderboard.map((curator, index) => {
                const rank = index + 1;
                const isTop3 = rank <= 3;

                return (
                  <tr
                    key={curator.id}
                    className={`border-b border-[#1c1f26] last:border-0 hover:bg-[#14171d] transition ${
                      isTop3 ? "bg-[#b8ff3d]/[0.03]" : ""
                    }`}
                  >
                    <td className="px-3 md:px-4 py-3.5">
                      <div className="flex justify-center">
                        <RankBadge rank={rank} />
                      </div>
                    </td>
                    <td className="px-3 md:px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                      {curator.avatar_url ? (
                        <img
                          src={curator.avatar_url}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover flex-shrink-0 ring-1 ring-[#1c1f26]"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-[#1c1f26] flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {(curator.display_name || "U")[0].toUpperCase()}
                        </div>
                      )}
                        <div className="flex items-center whitespace-nowrap text-sm">
                          <Link
                            href={`/${curator.display_name}`}
                            className="font-medium hover:text-[#b8ff3d] transition whitespace-nowrap"
                          >
                            {curator.display_name || "Anonymous"}
                          </Link>
                          <VerifiedBadge role={curator.role} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 md:px-4 py-3.5 text-center text-sm font-medium tabular-nums whitespace-nowrap">
                      {curator.tokens}
                    </td>
                    <td className="px-3 md:px-4 py-3.5 text-center text-sm font-semibold text-[#b8ff3d] tabular-nums whitespace-nowrap">
                      {curator.points.toLocaleString()}
                    </td>
                    <td className="px-3 md:px-4 py-3.5 text-center text-sm text-[#8b93a1] tabular-nums whitespace-nowrap">
                      {curator.multiplier.toFixed(1)}×
                    </td>
                    <td className="px-3 md:px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      {curator.twitter_url && (
                        <a
                          href={curator.twitter_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-[#8b93a1] hover:text-white hover:bg-[#1c1f26] transition"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                        </a>
                      )}
                      {curator.telegram_url && (
                        <a
                          href={curator.telegram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-[#8b93a1] hover:text-white hover:bg-[#1c1f26] transition"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.36-.49.99-.75 3.89-1.69 6.49-2.81 7.79-3.35 3.72-1.54 4.49-1.81 4.99-1.82.11 0 .35.03.51.14.13.09.17.21.19.3-.01.06.01.24 0 .38z" />
                          </svg>
                        </a>
                      )}
                    </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          {/* Formula */}
          <div className="mt-5 px-1">
            <p className="text-sm text-[#f4f6f8]">
              * Formula: Points = Tokens × 10 × Multiplier
            </p>
            <p className="mt-1 text-xs text-[#8b93a1] leading-relaxed max-w-2xl">
              Multiplier is the average performance of a curator’s approved
              tokens (current market cap ÷ market cap at approval), capped at
              10x.
            </p>
          </div>
        </>
      )}
    </div>
  );
}