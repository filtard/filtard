import { getCloudflareContext } from "@opennextjs/cloudflare";

// worker.ts keeps public HTML pages in the Cloudflare edge cache for a few
// seconds. Drop the edited pages from this data center's copy so an editor
// sees the change right away. Other data centers expire within the TTL.
const ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.filtard.com",
  "https://filtard.filtard.workers.dev",
];

export function purgeEdgePages(paths: string[]) {
  try {
    const cache = (globalThis as unknown as { caches?: { default?: Cache } })
      .caches?.default;
    if (!cache) return;
    const jobs = ORIGINS.flatMap((origin) =>
      paths.map((p) => cache.delete(new Request(new URL(p, origin).toString())))
    );
    const all = Promise.allSettled(jobs);
    try {
      getCloudflareContext().ctx.waitUntil(all);
    } catch {
      // Not on Workers.
    }
  } catch (err) {
    console.error("edge purge failed:", err);
  }
}
