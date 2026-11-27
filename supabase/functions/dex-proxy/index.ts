// Proxies DexScreener API reads for the Filtard Worker. Cloudflare Workers
// share egress IPs that DexScreener often rate limits (error 1015), so the
// site falls back to this function when a direct call fails.
const ALLOWED = ["/latest/dex/tokens/", "/tokens/v1/", "/latest/dex/pairs/"];

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-filtard-key") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const path = new URL(req.url).searchParams.get("path") || "";
  if (!path.startsWith("/") || !ALLOWED.some((p) => path.startsWith(p))) {
    return new Response("Bad path", { status: 400 });
  }
  const res = await fetch(`https://api.dexscreener.com${path}`, {
    headers: { accept: "application/json" },
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
});
