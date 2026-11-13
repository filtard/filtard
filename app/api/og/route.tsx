import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { isSubmitChain } from "@/lib/chains";
import { getOgTokenData } from "@/lib/og-token";

export const runtime = "nodejs";

// Loaded once per function instance instead of on every request.
const fontDir = join(process.cwd(), "assets", "fonts");
const interRegular = readFileSync(join(fontDir, "Inter-Regular.ttf"));
const interSemiBold = readFileSync(join(fontDir, "Inter-SemiBold.ttf"));
const logoDataUrl = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "logo.png")
).toString("base64")}`;

const fonts = [
  { name: "Inter", data: interRegular, style: "normal" as const, weight: 400 as const },
  { name: "Inter", data: interSemiBold, style: "normal" as const, weight: 600 as const },
];

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

const ADDRESS_RE = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

function formatPrice(raw: string | null): string {
  if (!raw || raw === "null" || raw === "") return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1) return "$" + n.toFixed(4);
  if (n >= 0.01) return "$" + n.toFixed(4);
  if (n >= 0.0001) return "$" + n.toFixed(6);
  return "$" + n.toPrecision(4);
}

function formatChange(raw: string | null): { text: string; color: string } {
  if (!raw || raw === "null" || raw === "") {
    return { text: "—", color: "#8b93a1" };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return { text: "—", color: "#8b93a1" };
  const sign = n > 0 ? "+" : "";
  return {
    text: sign + n.toFixed(2) + "%",
    color: n < 0 ? "#f87171" : "#4ade80",
  };
}

function formatMcap(raw: string | null): string {
  if (!raw || raw === "null" || raw === "") return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  let symbol = searchParams.get("symbol") || "???";
  let name = searchParams.get("name") || "Unknown";
  let priceRaw = searchParams.get("price");
  let changeRaw = searchParams.get("change");
  let mcapRaw = searchParams.get("mcap");
  let imageUrl = searchParams.get("image");

  // New stable links: /api/og?chain=..&address=..&v=<hour>.
  // Old links that carry the values in the URL keep working.
  const chain = (searchParams.get("chain") || "").toLowerCase();
  const address = (searchParams.get("address") || "").trim();
  if (chain && address) {
    if (!isSubmitChain(chain) || !ADDRESS_RE.test(address)) {
      return new Response("Not found", { status: 404 });
    }
    const data = await getOgTokenData(chain, address);
    if (data) {
      symbol = data.symbol || symbol;
      name = data.name || name;
      priceRaw = data.priceUsd != null ? String(data.priceUsd) : null;
      changeRaw = data.change24h != null ? String(data.change24h) : null;
      mcapRaw = data.marketCap != null ? String(data.marketCap) : null;
      imageUrl = data.imageUrl;
    }
  }

  const logoUrl = logoDataUrl;

  const price = formatPrice(priceRaw);
  const change = formatChange(changeRaw);
  const mcap = formatMcap(mcapRaw);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#07080a",
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            height: "100%",
            padding: "36px 48px 32px 48px",
          }}
        >
          {/* Top branding */}
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "flex-start",
              alignItems: "center",
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <img
                src={logoUrl}
                width={40}
                height={40}
                style={{ borderRadius: 8, marginRight: 12 }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 26,
                  fontWeight: 600,
                  color: "#f4f6f8",
                  letterSpacing: "-0.02em",
                }}
              >
                Filtard
              </div>
            </div>
          </div>

          {/* Main content */}
          <div
            style={{
              display: "flex",
              flex: 1,
              width: "100%",
              alignItems: "center",
            }}
          >
            {/* Left — identity */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                paddingRight: 40,
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  width={148}
                  height={148}
                  style={{
                    borderRadius: "50%",
                    marginRight: 28,
                    border: "2px solid #1c1f26",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    width: 148,
                    height: 148,
                    borderRadius: "50%",
                    backgroundColor: "#1c1f26",
                    marginRight: 28,
                  }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 56,
                    fontWeight: 600,
                    color: "#f4f6f8",
                    lineHeight: 1.1,
                    letterSpacing: "-0.03em",
                  }}
                >
                  ${symbol}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 26,
                    color: "#9ca3af",
                    marginTop: 6,
                  }}
                >
                  {name}
                </div>
              </div>
            </div>

            {/* Right — metrics panel */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: 340,
                backgroundColor: "#0e1014",
                borderRadius: 16,
                border: "1px solid #1c1f26",
                padding: "26px 30px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 17,
                    color: "#6b7280",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  Price
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 36,
                    fontWeight: 600,
                    color: "#f4f6f8",
                  }}
                >
                  {price}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 17,
                    color: "#6b7280",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  24h
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 36,
                    fontWeight: 600,
                    color: change.color,
                  }}
                >
                  {change.text}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 17,
                    color: "#6b7280",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  Market Cap
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 36,
                    fontWeight: 600,
                    color: "#f4f6f8",
                  }}
                >
                  {mcap}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom tagline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              marginTop: 28,
            }}
          >
            <div
              style={{
                display: "flex",
                width: "100%",
                height: 1,
                backgroundColor: "#1c1f26",
                marginBottom: 16,
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 26,
                color: "#8b93a1",
                fontWeight: 400,
              }}
            >
              Community-curated memecoin screener
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": CACHE_CONTROL,
      },
      fonts,
    }
  );
}