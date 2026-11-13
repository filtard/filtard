"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TokenTable from "./TokenTable";

type HomeToken = React.ComponentProps<typeof TokenTable>["tokens"][number] & {
  created_at?: string | null;
};

const NEW_WINDOW_MS = 72 * 60 * 60 * 1000;

function isRecentlyListed(createdAt: string | null | undefined, now: number) {
  if (!createdAt) return false;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts <= NEW_WINDOW_MS;
}

/** Applies the ?chain= and ?new=true filters in the browser so the home page can stay cached. */
export default function HomeTokenTable({ tokens }: { tokens: HomeToken[] }) {
  const searchParams = useSearchParams();
  const chain = searchParams.get("chain") || "all";
  const onlyNew = searchParams.get("new") === "true";
  // Captured once when the table mounts; good enough for a 72h window.
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    return tokens.filter((t) => {
      if (chain !== "all" && t.chain !== chain) return false;
      if (onlyNew && !isRecentlyListed(t.created_at, now)) return false;
      return true;
    });
  }, [tokens, chain, onlyNew, now]);

  return <TokenTable tokens={filtered} currentChain={chain} onlyNew={onlyNew} />;
}
