import { DurableObject } from "cloudflare:workers";

// Storage side of cloudflare/do-incremental-cache.ts.
export class IncCacheDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL)"
    );
  }

  getEntry(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM entries WHERE key = ?", key)
      .toArray();
    return rows[0]?.value ?? null;
  }

  setEntry(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO entries (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated",
      key,
      value,
      Date.now()
    );
  }

  deleteEntry(key: string): void {
    this.ctx.storage.sql.exec("DELETE FROM entries WHERE key = ?", key);
  }
}
