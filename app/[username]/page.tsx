import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import TokenTable from "@/app/components/TokenTable";
import TipButton from "@/app/components/TipButton";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import { isReservedRoute } from "@/lib/reserved";

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

const USERNAME_RE = /^[A-Za-z0-9_]{1,32}$/;

/** Reject bot and scanner paths (/.env, /wp-login.php) before any query. */
function assertValidUsername(username: string) {
  if (!USERNAME_RE.test(username) || isReservedRoute(username)) {
    notFound();
  }
}

type TokenStatsRow = {
  price_usd: number | string | null;
  change_24h: number | string | null;
  volume_24h: number | string | null;
  liquidity: number | string | null;
  market_cap: number | string | null;
  txns_24h: number | string | null;
  pair_created_at: number | string | null;
};

type TokenRow = {
  id: string;
  chain: string;
  address: string;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  token_stats: TokenStatsRow | TokenStatsRow[] | null;
};

function num(value: number | string | null | undefined): number | null {
  return value != null ? Number(value) : null;
}

async function getCuratorByUsername(username: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_url, role, twitter_url, telegram_url, discord_url, sol_wallet, evm_wallet"
    )
    .eq("display_name", username.toLowerCase())
    .maybeSingle();

  return profile;
}

async function getCuratorRating(tokenIds: string[]) {
  if (tokenIds.length === 0) return { average: 0, count: 0 };

  const { data } = await supabase
    .from("ratings")
    .select("stars")
    .in("token_id", tokenIds);

  if (!data || data.length === 0) {
    return { average: 0, count: 0 };
  }

  const sum = data.reduce((acc, r) => acc + r.stars, 0);
  const average = Number((sum / data.length).toFixed(1));

  return { average, count: data.length };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  assertValidUsername(username);
  const name = username.toLowerCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("display_name", name)
    .maybeSingle();

  const titleName = profile?.display_name || name;

  return {
    title: titleName,
    description: `${titleName} on Filtard — curated memecoins and theses.`,
  };
}

export default async function CuratorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  assertValidUsername(username);

  const curator = await getCuratorByUsername(username);
  if (!curator) {
    notFound();
  }

  const { data: tokens } = await supabase
    .from("tokens")
    .select(
      `id, chain, address, name, symbol, image_url,
      token_stats ( price_usd, change_24h, volume_24h, liquidity, market_cap, txns_24h, pair_created_at )`
    )
    .eq("submitted_by", curator.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const tokenList = (tokens || []) as TokenRow[];
  const tokenIds = tokenList.map((t) => t.id);

  const curatorRating = await getCuratorRating(tokenIds);

  // Stats come from token_stats (refreshed by the cron) instead of one
  // DexScreener call per token; TokenTable keeps them live in the browser.
  const tokensWithStats = tokenList.map(({ token_stats, ...token }) => {
    const s = Array.isArray(token_stats) ? token_stats[0] : token_stats;
    return {
      ...token,
      stats: s
        ? {
            priceUsd: num(s.price_usd),
            change24h: num(s.change_24h),
            volume24h: num(s.volume_24h),
            liquidity: num(s.liquidity),
            marketCap: num(s.market_cap),
            txns24h: num(s.txns_24h),
            pairCreatedAt: num(s.pair_created_at),
          }
        : null,
    };
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        {curator.avatar_url ? (
          <img
            src={curator.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-[#1c1f26] flex items-center justify-center text-xl font-medium">
            {(curator.display_name || "U")[0].toUpperCase()}
          </div>
        )}

        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">
              {curator.display_name || "Anonymous Curator"}
              <VerifiedBadge role={curator.role} />
            </h1>

            <div className="flex items-center gap-2.5">
              {curator.twitter_url && (
                <a
                  href={curator.twitter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8b93a1] hover:text-white transition"
                  title="X"
                >
                  <svg
                    width="16"
                    height="16"
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
                  className="text-[#8b93a1] hover:text-white transition"
                  title="Telegram"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.36-.49.99-.75 3.89-1.69 6.49-2.81 7.79-3.35 3.72-1.54 4.49-1.81 4.99-1.82.11 0 .35.03.51.14.13.09.17.21.19.3-.01.06.01.24 0 .38z" />
                  </svg>
                </a>
              )}

              {curator.discord_url && (
                <a
                  href={curator.discord_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8b93a1] hover:text-white transition"
                  title="Discord"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </a>
              )}

              <TipButton
                username={curator.display_name || "curator"}
                solWallet={curator.sol_wallet}
                evmWallet={curator.evm_wallet}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5">
            {curatorRating.count > 0 ? (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-[#b8ff3d]">★</span>
                <span className="font-medium text-white">
                  {curatorRating.average}
                </span>
                <span className="text-[#8b93a1]">
                  ({curatorRating.count} rating
                  {curatorRating.count !== 1 ? "s" : ""})
                </span>
              </div>
            ) : (
              <span className="text-sm text-[#8b93a1]">No ratings yet</span>
            )}
          </div>
        </div>
      </div>

      <TokenTable tokens={tokensWithStats} />
    </div>
  );
}