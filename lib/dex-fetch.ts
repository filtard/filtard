// Server-side DexScreener reads. Cloudflare Workers share egress IPs that
// DexScreener often rate limits (error 1015), so a failed direct call is
// retried through the Supabase `dex-proxy` edge function.
type DexInit = RequestInit & { next?: { revalidate?: number | false } };

export async function dexFetch(path: string, init: DexInit = {}): Promise<Response> {
  try {
    const direct = await fetch(`https://api.dexscreener.com${path}`, init);
    if (direct.ok || (direct.status < 500 && direct.status !== 429 && direct.status !== 403)) {
      return direct;
    }
  } catch {
    // fall through to the proxy
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response(null, { status: 503 });
  return fetch(`${base}/functions/v1/dex-proxy?path=${encodeURIComponent(path)}`, {
    ...init,
    headers: { "x-filtard-key": secret },
  });
}
