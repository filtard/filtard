import { NextRequest, NextResponse } from "next/server";
import { isStaffRole } from "@/lib/roles";
import { isAuthFailure, requireUser } from "@/lib/server-auth";
import { refreshTokenPage } from "@/lib/token-cache";

export const dynamic = "force-dynamic";

/**
 * Called by the thesis editor after a save so the cached token page shows the
 * new thesis right away. Only staff or the token's curator can trigger it.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (isAuthFailure(auth)) return auth.response;

  const body = await request.json().catch(() => null);
  const tokenId = typeof body?.tokenId === "string" ? body.tokenId : "";
  if (!tokenId) {
    return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
  }

  const { data: token } = await auth.admin
    .from("tokens")
    .select("chain, address, submitted_by")
    .eq("id", tokenId)
    .maybeSingle();

  if (!token) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  if (!isStaffRole(auth.role) && token.submitted_by !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  refreshTokenPage(token.chain, token.address);
  return NextResponse.json({ success: true });
}
