import { NextRequest, NextResponse } from "next/server";
import { isSubmitChain } from "@/lib/chains";
import { getDexTokenMeta } from "@/lib/dexscreener";
import { publishesImmediately } from "@/lib/roles";
import { isAuthFailure, requireUser } from "@/lib/server-auth";
import { announceApprovedToken } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isAuthFailure(auth)) return auth.response;

    const body = await request.json().catch(() => null);
    const chain = String(body?.chain || "")
      .trim()
      .toLowerCase();
    const address = String(body?.address || "").trim();
    const thesis = String(body?.thesis || "").trim();
    const confidence = Number(body?.confidence);

    if (!isSubmitChain(chain)) {
      return NextResponse.json({ error: "Invalid chain" }, { status: 400 });
    }

    if (address.length < 20 || address.length > 128 || /\s/.test(address)) {
      return NextResponse.json(
        { error: "Invalid contract address" },
        { status: 400 }
      );
    }

    if (!thesis || thesis.length > 3000) {
      return NextResponse.json(
        { error: "Thesis is required (max 3000 characters)" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 100) {
      return NextResponse.json(
        { error: "Confidence must be between 1 and 100" },
        { status: 400 }
      );
    }

    const meta = await getDexTokenMeta(address);
    const live = publishesImmediately(auth.role);
    const approvedAt = new Date().toISOString();

    const row: Record<string, unknown> = {
      chain,
      address,
      name: meta.name,
      symbol: meta.symbol,
      image_url: meta.imageUrl,
      status: live ? "approved" : "pending",
      submitted_by: auth.user.id,
      thesis,
      confidence,
    };

    if (live) {
      row.approved_by = auth.user.id;
      row.approved_at = approvedAt;
      row.initial_mcap = meta.marketCap;
    }

    const { data: inserted, error } = await auth.admin
      .from("tokens")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      const duplicate =
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate") ||
        error.message.includes("tokens_chain_address_key");

      if (duplicate) {
        return NextResponse.json(
          {
            error: "already_added",
            symbol: meta.symbol,
            message: `${meta.symbol || "Token"} already added`,
          },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (live && inserted?.id) {
      const { data: profile } = await auth.admin
        .from("profiles")
        .select("display_name")
        .eq("id", auth.user.id)
        .maybeSingle();

      await announceApprovedToken(auth.admin, inserted.id, {
        name: meta.name,
        symbol: meta.symbol,
        chain,
        address,
        thesis,
        marketCap: meta.marketCap,
        curatorName: profile?.display_name ?? null,
        imageUrl: meta.imageUrl,
      });
    }

    return NextResponse.json({
      success: true,
      status: live ? "approved" : "pending",
      symbol: meta.symbol,
      name: meta.name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("submit token error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
