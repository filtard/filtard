import { NextRequest, NextResponse } from "next/server";
import { isAuthFailure, requireStaff } from "@/lib/server-auth";
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
      return NextResponse.json({ error: "No token ids provided" }, { status: 400 });
    }

    // 1. Delete related rows (service role — no RLS block)
    const childTables = ["ratings", "token_views", "token_stats"] as const;

    for (const table of childTables) {
      const { error } = await auth.admin.from(table).delete().in("token_id", ids);
      if (error) {
        return NextResponse.json(
          { error: `Failed deleting ${table}: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // 2. Delete tokens
    const { error: tokenError } = await auth.admin
      .from("tokens")
      .delete()
      .in("id", ids);

    if (tokenError) {
      return NextResponse.json(
        { error: `Failed deleting tokens: ${tokenError.message}` },
        { status: 500 }
      );
    }

    refreshTokenListPages();

    return NextResponse.json({
      success: true,
      deleted: ids.length,
    });
  } catch (err: any) {
    console.error("delete-token error:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}