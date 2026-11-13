import { NextRequest, NextResponse } from "next/server";
import { isAuthFailure, requireStaff } from "@/lib/server-auth";
import { refreshTokenListPages } from "@/lib/token-cache";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request);
    if (isAuthFailure(auth)) return auth.response;

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    const pinned = body?.pinned === true;

    if (!id) {
      return NextResponse.json({ error: "Token id is required" }, { status: 400 });
    }

    if (pinned) {
      const { error: clearError } = await auth.admin
        .from("tokens")
        .update({ is_pinned: false })
        .eq("is_pinned", true);

      if (clearError) {
        return NextResponse.json({ error: clearError.message }, { status: 500 });
      }
    }

    const { data, error } = await auth.admin
      .from("tokens")
      .update({ is_pinned: pinned })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    refreshTokenListPages();
    return NextResponse.json({ success: true, pinned });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("pin-token error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
