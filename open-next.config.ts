import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doIncrementalCache from "./cloudflare/do-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: doIncrementalCache,
  tagCache: doShardedTagCache({
    baseShardSize: 2,
    regionalCache: true,
    regionalCacheTtlSec: 5,
  }),
  queue: doQueue,
  // Serve ISR pages straight from the cache without booting Next.js.
  enableCacheInterception: true,
});
