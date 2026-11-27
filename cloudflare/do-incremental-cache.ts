// OpenNext incremental cache stored in a SQLite Durable Object.
// Durable Objects are on the Workers free plan and allow far more
// writes per day than KV (1,000), which ISR with revalidate 60 exceeds.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createHash } from "node:crypto";
import type {
  CacheEntryType,
  CacheValue,
  IncrementalCache,
  WithLastModified,
} from "@opennextjs/aws/types/overrides.js";

type IncCacheStub = {
  getEntry(key: string): Promise<string | null>;
  setEntry(key: string, value: string): Promise<void>;
  deleteEntry(key: string): Promise<void>;
};

const SHARDS = 4;

function cacheKey(key: string, cacheType?: CacheEntryType) {
  const hash = createHash("sha256").update(key).digest("hex");
  const buildId = process.env.OPEN_NEXT_BUILD_ID ?? "no-build-id";
  return { id: `${buildId}/${hash}.${cacheType ?? "cache"}`, hash };
}

function stubFor(hash: string): IncCacheStub | null {
  const ns = (getCloudflareContext().env as Record<string, unknown>)
    .NEXT_INC_CACHE_DO as DurableObjectNamespace | undefined;
  if (!ns) return null;
  const shard = parseInt(hash.slice(0, 4), 16) % SHARDS;
  return ns.get(ns.idFromName(`inc-cache-${shard}`)) as unknown as IncCacheStub;
}

const doIncrementalCache: IncrementalCache = {
  name: "filtard-do-incremental-cache",
  async get<CacheType extends CacheEntryType = "cache">(
    key: string,
    cacheType?: CacheType
  ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
    const { id, hash } = cacheKey(key, cacheType);
    const stub = stubFor(hash);
    if (!stub) return null;
    try {
      const raw = await stub.getEntry(id);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error("inc-cache get failed", e);
      return null;
    }
  },
  async set<CacheType extends CacheEntryType = "cache">(
    key: string,
    value: CacheValue<CacheType>,
    cacheType?: CacheType
  ): Promise<void> {
    const { id, hash } = cacheKey(key, cacheType);
    const stub = stubFor(hash);
    if (!stub) return;
    try {
      await stub.setEntry(
        id,
        JSON.stringify({ value, lastModified: Date.now() })
      );
    } catch (e) {
      console.error("inc-cache set failed", e);
    }
  },
  async delete(key: string): Promise<void> {
    const { id, hash } = cacheKey(key, "cache");
    const stub = stubFor(hash);
    if (!stub) return;
    try {
      await stub.deleteEntry(id);
    } catch (e) {
      console.error("inc-cache delete failed", e);
    }
  },
};

export default doIncrementalCache;
