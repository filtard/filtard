import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Cached (ISR) for 3 minutes; the ticker refreshes on the same interval.
export const revalidate = 180;

type TopRow = {
  token_id: string;
  volume_24h: number | string | null;
  change_24h: number | string | null;
  tokens:
    | { chain: string; address: string; symbol: string | null }
    | { chain: string; address: string; symbol: string | null }[]
    | null;
};

export async function GET() {
  try {
    // True top 5 approved tokens by 24h volume, sorted in the database.
    const { data, error } = await supabase
      .from("token_stats")
      .select(
        "token_id, volume_24h, change_24h, tokens!inner(chain, address, symbol, status)"
      )
      .eq("tokens.status", "approved")
      .not("volume_24h", "is", null)
      .order("volume_24h", { ascending: false })
      .limit(5);

    if (error) throw error;

    const top5 = ((data || []) as TopRow[]).flatMap((row) => {
      const token = Array.isArray(row.tokens) ? row.tokens[0] : row.tokens;
      if (!token) return [];
      return [
        {
          id: row.token_id,
          chain: token.chain,
          address: token.address,
          symbol: token.symbol,
          volume24h: row.volume_24h != null ? Number(row.volume_24h) : 0,
          change24h: row.change_24h != null ? Number(row.change_24h) : 0,
        },
      ];
    });

    return NextResponse.json(top5, {
      headers: {
        "Cache-Control": "public, s-maxage=180, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("top-tokens error:", error);
    return NextResponse.json([], {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
