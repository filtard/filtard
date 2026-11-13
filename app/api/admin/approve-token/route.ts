import { NextRequest, NextResponse } from "next/server";
import { getDexTokenMeta } from "@/lib/dexscreener";
import { isAuthFailure, requireStaff } from "@/lib/server-auth";
import { announceApprovedToken } from "@/lib/telegram";
import { refreshTokenListPages } from "@/lib/token-cache";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request);
    if (isAuthFailure(auth)) return auth.response;

    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids
      : body?.id
        ? [body.id]
        : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No token ids provided" },
        { status: 400 }
      );
    }

    const { data: tokens, error: fetchError } = await auth.admin
      .from("tokens")
      .select(
        "id, chain, address, name, symbol, image_url, thesis, status, submitted_by"
      )
      .in("id", ids);

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: "No tokens found" }, { status: 404 });
    }

    const curatorIds = [
      ...new Set(
        tokens
          .map((token) => token.submitted_by)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const curatorNames = new Map<string, string | null>();

    if (curatorIds.length > 0) {
      const { data: profiles } = await auth.admin
        .from("profiles")
        .select("id, display_name")
        .in("id", curatorIds);

      for (const profile of profiles || []) {
        curatorNames.set(profile.id, profile.display_name ?? null);
      }
    }

    const approvedAt = new Date().toISOString();
    let approved = 0;

    for (const token of tokens) {
      const meta = await getDexTokenMeta(token.address);
      const becameApproved = token.status !== "approved";
      const { error } = await auth.admin
        .from("tokens")
        .update({
          status: "approved",
          approved_by: auth.user.id,
          approved_at: approvedAt,
          initial_mcap: meta.marketCap,
        })
        .eq("id", token.id);

      if (error) {
        return NextResponse.json(
          { error: `Failed approving ${token.id}: ${error.message}` },
          { status: 500 }
        );
      }
      approved += 1;

      if (!becameApproved) continue;

      await announceApprovedToken(auth.admin, token.id, {
        name: token.name || meta.name,
        symbol: token.symbol || meta.symbol,
        chain: token.chain,
        address: token.address,
        thesis: token.thesis,
        marketCap: meta.marketCap,
        curatorName: token.submitted_by
          ? (curatorNames.get(token.submitted_by) ?? null)
          : null,
        imageUrl: token.image_url || meta.imageUrl,
      });
    }

    refreshTokenListPages();
    return NextResponse.json({ success: true, approved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("approve-token error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}