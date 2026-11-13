"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

type TokenWithStats = {
  id: string;
  chain: string;
  address: string;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  is_pinned?: boolean;
  ratingAvg?: number;
  stats: {
    priceUsd: number | null;
    change24h: number | null;
    volume24h: number | null;
    liquidity: number | null;
    marketCap: number | null;
    txns24h: number | null;
    pairCreatedAt: number | null;
  } | null;
};

type SortKey =
  | "symbol"
  | "marketCap"
  | "priceUsd"
  | "change24h"
  | "volume24h"
  | "txns24h"
  | "liquidity"
  | "rating"
  | "age";

type SortDirection = "asc" | "desc";

const PAGE_SIZE = 50;

const CHAINS = [
  { id: "all", label: "All Chains" },
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" },
  { id: "bsc", label: "BSC" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "robinhood", label: "Robinhood" },
];

const AGE_OPTIONS = [
  { id: "any", label: "Any age" },
  { id: "24h", label: "< 24h" },
  { id: "7d", label: "< 7d" },
  { id: "30d", label: "< 30d" },
];

const MCAP_OPTIONS = [
  { id: "any", label: "Any mcap" },
  { id: "lt10k", label: "< $10K" },
  { id: "10k-100k", label: "$10K – $100K" },
  { id: "100k-1m", label: "$100K – $1M" },
  { id: "1m-10m", label: "$1M – $10M" },
  { id: "gt10m", label: "> $10M" },
];

const LIQ_OPTIONS = [
  { id: "any", label: "Any liq" },
  { id: "gt1k", label: "> $1K" },
  { id: "gt5k", label: "> $5K" },
  { id: "gt10k", label: "> $10K" },
  { id: "gt50k", label: "> $50K" },
  { id: "gt100k", label: "> $100K" },
];

const VOL_OPTIONS = [
  { id: "any", label: "Any volume" },
  { id: "gt1k", label: "> $1K" },
  { id: "gt5k", label: "> $5K" },
  { id: "gt10k", label: "> $10K" },
  { id: "gt50k", label: "> $50K" },
  { id: "gt100k", label: "> $100K" },
];

const TXNS_OPTIONS = [
  { id: "any", label: "Any txns" },
  { id: "gt10", label: "> 10" },
  { id: "gt50", label: "> 50" },
  { id: "gt100", label: "> 100" },
  { id: "gt500", label: "> 500" },
  { id: "gt1000", label: "> 1K" },
];

function formatUsd(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;

  const s = n.toFixed(12);
  const match = s.match(/^0\.(0+)(\d+)/);
  if (match) {
    const zeros = match[1].length;
    const digits = match[2].replace(/0+$/, "").slice(0, 4) || "0";
    const sub = "₀₁₂₃₄₅₆₇₈₉";
    const zeroStr = String(zeros)
      .split("")
      .map((d) => sub[Number(d)])
      .join("");
    return `$0.0${zeroStr}${digits}`;
  }
  return `$${n.toPrecision(4)}`;
}

function formatPct(n: number | null) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatAge(timestamp: number | null) {
  if (!timestamp) return "—";
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return (
      <svg
        className="w-3 h-3 opacity-30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
    );
  }
  return direction === "asc" ? (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  ) : (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const mutedBtn =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition bg-[#101215] text-[#8b93a1] border-[#1c1f26] hover:border-[#3a3f4b] hover:text-[#f4f6f8]";
const mutedBtnActive =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition bg-[#1c1f26] text-[#b8ff3d] border-[#b8ff3d]/30";

type FilterState = {
  minStars: string;
  age: string;
  ageMin: string;
  ageMax: string;
  mcap: string;
  mcapMin: string;
  mcapMax: string;
  liq: string;
  liqMin: string;
  liqMax: string;
  vol: string;
  volMin: string;
  volMax: string;
  txns: string;
  txnsMin: string;
  txnsMax: string;
  changeMin: string;
};

const DEFAULT_FILTERS: FilterState = {
  minStars: "any",
  age: "any",
  ageMin: "",
  ageMax: "",
  mcap: "any",
  mcapMin: "",
  mcapMax: "",
  liq: "any",
  liqMin: "",
  liqMax: "",
  vol: "any",
  volMin: "",
  volMax: "",
  txns: "any",
  txnsMin: "",
  txnsMax: "",
  changeMin: "",
};

export default function TokenTable({
  tokens,
  currentChain = "all",
  onlyNew = false,
}: {
  tokens: TokenWithStats[];
  currentChain?: string;
  onlyNew?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const desktopControlsRef = useRef<HTMLDivElement>(null);
  const desktopHeaderRef = useRef<HTMLDivElement>(null);

  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [draft, setDraft] = useState<FilterState>(DEFAULT_FILTERS);

  const [liveTokens, setLiveTokens] = useState(tokens);

  useEffect(() => {
    setLiveTokens(tokens);
  }, [tokens]);

  useLayoutEffect(() => {
    const controls = desktopControlsRef.current;
    const header = desktopHeaderRef.current;
    if (!controls || !header) return;

    const update = () => {
      const height = controls.getBoundingClientRect().height;
      header.style.top = `calc(3rem + ${height}px)`;
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(controls);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      try {
        const res = await fetch("/api/token-stats");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.stats) return;

        setLiveTokens((prev) =>
          prev.map((t) => {
            const s = data.stats[t.id];
            if (!s) return t;
            return { ...t, stats: s };
          })
        );
      } catch {
        // ignore
      }
    }

    poll();
    const interval = setInterval(poll, 30_000);

    function onVisibility() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("filtard-watchlist");
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && showFilters) {
        handleCancel();
      }
    }
    if (showFilters) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [showFilters]);

  useEffect(() => {
    function onToggleSearch() {
      setShowSearch((prev) => {
        const next = !prev;
        if (next) {
          window.scrollTo({ top: 0, behavior: "instant" });
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }
        return next;
      });
      setShowFilters(false);
    }

    function onToggleWatchlist() {
      setShowWatchlistOnly((prev) => !prev);
      setShowSearch(false);
      setShowFilters(false);
      setPage(1);
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    function onCloseAll() {
      setShowSearch(false);
      setShowWatchlistOnly(false);
      setShowFilters(false);
      setSearch("");
      setPage(1);
    }

    window.addEventListener("filtard-toggle-search", onToggleSearch);
    window.addEventListener("filtard-toggle-watchlist", onToggleWatchlist);
    window.addEventListener("filtard-close-all", onCloseAll);

    return () => {
      window.removeEventListener("filtard-toggle-search", onToggleSearch);
      window.removeEventListener("filtard-toggle-watchlist", onToggleWatchlist);
      window.removeEventListener("filtard-close-all", onCloseAll);
    };
  }, []);

  function openFilters() {
    setDraft({ ...applied });
    setShowFilters(true);
  }

  function handleApply() {
    setApplied({ ...draft });
    setShowFilters(false);
    setPage(1);
  }

  function handleCancel() {
    setShowFilters(false);
  }

  function clearAll() {
    setDraft({ ...DEFAULT_FILTERS });
    setApplied({ ...DEFAULT_FILTERS });
    setPage(1);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" || key === "age" ? "asc" : "desc");
    }
    setPage(1);
  }

  const activeFilters = showFilters ? draft : applied;

  const activeFilterCount = [
    activeFilters.minStars !== "any",
    activeFilters.age !== "any" ||
      activeFilters.ageMin !== "" ||
      activeFilters.ageMax !== "",
    activeFilters.mcap !== "any" ||
      activeFilters.mcapMin !== "" ||
      activeFilters.mcapMax !== "",
    activeFilters.liq !== "any" ||
      activeFilters.liqMin !== "" ||
      activeFilters.liqMax !== "",
    activeFilters.vol !== "any" ||
      activeFilters.volMin !== "" ||
      activeFilters.volMax !== "",
    activeFilters.txns !== "any" ||
      activeFilters.txnsMin !== "" ||
      activeFilters.txnsMax !== "",
    activeFilters.changeMin !== "",
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    let list = [...liveTokens];

    if (showWatchlistOnly) {
      list = list.filter((t) => watchlist.includes(t.id));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.symbol?.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
      );
    }

    if (activeFilters.minStars !== "any") {
      const min = Number(activeFilters.minStars);
      if (!isNaN(min)) {
        list = list.filter((t) => (t.ratingAvg ?? 0) >= min);
      }
    }

    {
      const hasCustom =
        activeFilters.ageMin !== "" || activeFilters.ageMax !== "";
      if (hasCustom || activeFilters.age !== "any") {
        const now = Date.now();
        list = list.filter((t) => {
          const ts = t.stats?.pairCreatedAt;
          if (!ts) return false;
          const hours = (now - ts) / (1000 * 60 * 60);

          if (hasCustom) {
            const min =
              activeFilters.ageMin !== "" ? Number(activeFilters.ageMin) : 0;
            const max =
              activeFilters.ageMax !== ""
                ? Number(activeFilters.ageMax)
                : Infinity;
            if (isNaN(min) || isNaN(max)) return true;
            return hours >= min && hours <= max;
          }

          if (activeFilters.age === "24h") return hours <= 24;
          if (activeFilters.age === "7d") return hours <= 24 * 7;
          if (activeFilters.age === "30d") return hours <= 24 * 30;
          return true;
        });
      }
    }

    {
      const hasCustom =
        activeFilters.mcapMin !== "" || activeFilters.mcapMax !== "";
      if (hasCustom || activeFilters.mcap !== "any") {
        list = list.filter((t) => {
          const m = t.stats?.marketCap;
          if (m == null) return false;

          if (hasCustom) {
            const min =
              activeFilters.mcapMin !== "" ? Number(activeFilters.mcapMin) : 0;
            const max =
              activeFilters.mcapMax !== ""
                ? Number(activeFilters.mcapMax)
                : Infinity;
            if (isNaN(min) || isNaN(max)) return true;
            return m >= min && m <= max;
          }

          if (activeFilters.mcap === "lt10k") return m < 10_000;
          if (activeFilters.mcap === "10k-100k")
            return m >= 10_000 && m < 100_000;
          if (activeFilters.mcap === "100k-1m")
            return m >= 100_000 && m < 1_000_000;
          if (activeFilters.mcap === "1m-10m")
            return m >= 1_000_000 && m < 10_000_000;
          if (activeFilters.mcap === "gt10m") return m >= 10_000_000;
          return true;
        });
      }
    }

    {
      const hasCustom =
        activeFilters.liqMin !== "" || activeFilters.liqMax !== "";
      if (hasCustom || activeFilters.liq !== "any") {
        list = list.filter((t) => {
          const l = t.stats?.liquidity;
          if (l == null) return false;

          if (hasCustom) {
            const min =
              activeFilters.liqMin !== "" ? Number(activeFilters.liqMin) : 0;
            const max =
              activeFilters.liqMax !== ""
                ? Number(activeFilters.liqMax)
                : Infinity;
            if (isNaN(min) || isNaN(max)) return true;
            return l >= min && l <= max;
          }

          if (activeFilters.liq === "gt1k") return l >= 1_000;
          if (activeFilters.liq === "gt5k") return l >= 5_000;
          if (activeFilters.liq === "gt10k") return l >= 10_000;
          if (activeFilters.liq === "gt50k") return l >= 50_000;
          if (activeFilters.liq === "gt100k") return l >= 100_000;
          return true;
        });
      }
    }

    {
      const hasCustom =
        activeFilters.volMin !== "" || activeFilters.volMax !== "";
      if (hasCustom || activeFilters.vol !== "any") {
        list = list.filter((t) => {
          const v = t.stats?.volume24h;
          if (v == null) return false;

          if (hasCustom) {
            const min =
              activeFilters.volMin !== "" ? Number(activeFilters.volMin) : 0;
            const max =
              activeFilters.volMax !== ""
                ? Number(activeFilters.volMax)
                : Infinity;
            if (isNaN(min) || isNaN(max)) return true;
            return v >= min && v <= max;
          }

          if (activeFilters.vol === "gt1k") return v >= 1_000;
          if (activeFilters.vol === "gt5k") return v >= 5_000;
          if (activeFilters.vol === "gt10k") return v >= 10_000;
          if (activeFilters.vol === "gt50k") return v >= 50_000;
          if (activeFilters.vol === "gt100k") return v >= 100_000;
          return true;
        });
      }
    }

    {
      const hasCustom =
        activeFilters.txnsMin !== "" || activeFilters.txnsMax !== "";
      if (hasCustom || activeFilters.txns !== "any") {
        list = list.filter((t) => {
          const tx = t.stats?.txns24h;
          if (tx == null) return false;

          if (hasCustom) {
            const min =
              activeFilters.txnsMin !== "" ? Number(activeFilters.txnsMin) : 0;
            const max =
              activeFilters.txnsMax !== ""
                ? Number(activeFilters.txnsMax)
                : Infinity;
            if (isNaN(min) || isNaN(max)) return true;
            return tx >= min && tx <= max;
          }

          if (activeFilters.txns === "gt10") return tx >= 10;
          if (activeFilters.txns === "gt50") return tx >= 50;
          if (activeFilters.txns === "gt100") return tx >= 100;
          if (activeFilters.txns === "gt500") return tx >= 500;
          if (activeFilters.txns === "gt1000") return tx >= 1000;
          return true;
        });
      }
    }

    if (activeFilters.changeMin !== "") {
      const min = Number(activeFilters.changeMin);
      if (!isNaN(min)) {
        list = list.filter((t) => (t.stats?.change24h ?? -999) >= min);
      }
    }

    const pinned = list.filter((t) => t.is_pinned);
    const rest = list.filter((t) => !t.is_pinned);

    rest.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortKey) {
        case "symbol":
          aVal = (a.symbol || "").toLowerCase();
          bVal = (b.symbol || "").toLowerCase();
          break;
        case "marketCap":
          aVal = a.stats?.marketCap ?? -1;
          bVal = b.stats?.marketCap ?? -1;
          break;
        case "priceUsd":
          aVal = a.stats?.priceUsd ?? -1;
          bVal = b.stats?.priceUsd ?? -1;
          break;
        case "change24h":
          aVal = a.stats?.change24h ?? -999;
          bVal = b.stats?.change24h ?? -999;
          break;
        case "volume24h":
          aVal = a.stats?.volume24h ?? -1;
          bVal = b.stats?.volume24h ?? -1;
          break;
        case "txns24h":
          aVal = a.stats?.txns24h ?? -1;
          bVal = b.stats?.txns24h ?? -1;
          break;
        case "liquidity":
          aVal = a.stats?.liquidity ?? -1;
          bVal = b.stats?.liquidity ?? -1;
          break;
        case "rating":
          aVal = a.ratingAvg ?? 0;
          bVal = b.ratingAvg ?? 0;
          break;
        case "age":
          aVal = a.stats?.pairCreatedAt ?? 0;
          bVal = b.stats?.pairCreatedAt ?? 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return [...pinned, ...rest];
  }, [
    liveTokens,
    search,
    sortKey,
    sortDir,
    showWatchlistOnly,
    watchlist,
    activeFilters,
  ]);

  const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageTokens = filteredAndSorted.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  const currentChainLabel =
    CHAINS.find((c) => c.id === currentChain)?.label || "All Chains";

  function buildUrl(params: { chain?: string; new?: boolean }) {
    const search = new URLSearchParams();
    if (params.chain && params.chain !== "all")
      search.set("chain", params.chain);
    if (params.new) search.set("new", "true");
    const str = search.toString();
    return str ? `/?${str}` : "/";
  }

  const chipClass = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs border transition ${
      active
        ? "bg-[#b8ff3d]/10 text-[#b8ff3d] border-[#b8ff3d]/30"
        : "bg-[#101215] text-[#8b93a1] border-[#1c1f26] hover:border-[#3a3f4b]"
    }`;

  const inputClass =
    "w-full rounded-lg border border-[#1c1f26] bg-[#101215] px-3 py-1.5 text-sm text-[#f4f6f8] placeholder:text-[#5c6573] focus:outline-none focus:border-[#b8ff3d]/40";

  return (
    <div className="w-full">
      {/* ===== DESKTOP CONTROLS ===== */}
      <div
        ref={desktopControlsRef}
        className="hidden md:flex flex-wrap items-center gap-3 sticky top-12 z-40 -mx-6 px-6 py-3 mb-5 border-b border-[#1c1f26] bg-[#07080a]/95 backdrop-blur-md"
      >
        <div className="relative">
          <details className="group">
            <summary className={`${mutedBtn} cursor-pointer list-none`}>
              <span className="text-[#f4f6f8] font-medium">
                {currentChainLabel}
              </span>
              <svg
                className="w-4 h-4 text-[#8b93a1] group-open:rotate-180 transition"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="absolute left-0 mt-2 w-48 rounded-xl border border-[#1c1f26] bg-[#101215] shadow-xl overflow-hidden z-40">
              {CHAINS.map((c) => (
                <Link
                  key={c.id}
                  href={buildUrl({ chain: c.id, new: onlyNew })}
                  className={`block px-4 py-2.5 text-sm transition ${
                    currentChain === c.id
                      ? "bg-[#b8ff3d]/10 text-[#b8ff3d]"
                      : "text-[#f4f6f8] hover:bg-[#1c1f26]"
                  }`}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </details>
        </div>

        <Link
          href={buildUrl({ chain: currentChain, new: !onlyNew })}
          className={onlyNew ? mutedBtnActive : mutedBtn}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
          Recent
        </Link>

        <button
          onClick={() => {
            setShowWatchlistOnly((prev) => !prev);
            setPage(1);
          }}
          className={showWatchlistOnly ? mutedBtnActive : mutedBtn}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Watchlist
        </button>

        <button
          onClick={openFilters}
          className={activeFilterCount > 0 ? mutedBtnActive : mutedBtn}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="8" x2="20" y2="8" />
            <line x1="8" y1="4" x2="8" y2="12" />
            <line x1="4" y1="16" x2="20" y2="16" />
            <line x1="16" y1="12" x2="16" y2="20" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#b8ff3d] text-[10px] font-bold text-black">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5c6573] pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, ticker or CA..."
            className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] pl-10 pr-10 py-2.5 text-sm placeholder:text-[#5c6573] focus:outline-none focus:border-[#b8ff3d]/50 focus:ring-1 focus:ring-[#b8ff3d]/20 transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5c6573] hover:text-white transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ===== MOBILE CONTROLS ===== */}
      <div className="md:hidden sticky top-10 z-40 -mx-3 px-3 py-2.5 mb-4 border-b border-[#1c1f26] bg-[#07080a]/95 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <details className="group">
              <summary
                className={`${mutedBtn} cursor-pointer list-none text-xs px-3 py-1.5`}
              >
                <span className="text-[#f4f6f8] font-medium">
                  {currentChainLabel}
                </span>
                <svg
                  className="w-3.5 h-3.5 text-[#8b93a1] group-open:rotate-180 transition"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <div className="absolute left-0 mt-2 w-44 rounded-xl border border-[#1c1f26] bg-[#101215] shadow-xl overflow-hidden z-40">
                {CHAINS.map((c) => (
                  <Link
                    key={c.id}
                    href={buildUrl({ chain: c.id, new: onlyNew })}
                    className={`block px-3 py-2 text-sm transition ${
                      currentChain === c.id
                        ? "bg-[#b8ff3d]/10 text-[#b8ff3d]"
                        : "text-[#f4f6f8] hover:bg-[#1c1f26]"
                    }`}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </details>
          </div>

          <Link
            href={buildUrl({ chain: currentChain, new: !onlyNew })}
            className={
              onlyNew
                ? mutedBtnActive + " text-xs px-3 py-1.5"
                : mutedBtn + " text-xs px-3 py-1.5"
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
            Recent
          </Link>

          <button
            onClick={openFilters}
            className={
              (activeFilterCount > 0 ? mutedBtnActive : mutedBtn) +
              " text-xs px-3 py-1.5"
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="8" y1="4" x2="8" y2="12" />
              <line x1="4" y1="16" x2="20" y2="16" />
              <line x1="16" y1="12" x2="16" y2="20" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#b8ff3d] text-[10px] font-bold text-black">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showSearch && (
          <div className="mt-2.5 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, ticker or CA..."
              className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-3 py-2.5 text-sm placeholder:text-[#5c6573] focus:outline-none focus:border-[#b8ff3d]/50"
            />
          </div>
        )}
      </div>

      {/* ===== FILTERS PANEL ===== */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCancel}
          />
          <div className="relative w-full max-w-lg max-h-[85vh] md:max-h-[80vh] rounded-t-2xl md:rounded-2xl border border-[#1c1f26] bg-[#0c0d10] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1f26]">
              <h3 className="text-base font-semibold">Filters</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={clearAll}
                  className="text-sm text-[#8b93a1] hover:text-white transition"
                >
                  Clear all
                </button>
                <button
                  onClick={() => {
                    setDraft({ ...DEFAULT_FILTERS });
                    setApplied({ ...DEFAULT_FILTERS });
                    setPage(1);
                    setShowFilters(false);
                  }}
                  className="text-[#8b93a1] hover:text-white transition"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto filters-scroll px-5 py-5 space-y-6">
              <div>
                <p className="text-sm font-medium mb-2.5">Min rating</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setDraft((d) => ({ ...d, minStars: "any" }))
                    }
                    className={chipClass(draft.minStars === "any")}
                  >
                    Any
                  </button>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        setDraft((d) => ({ ...d, minStars: String(n) }))
                      }
                      className={chipClass(draft.minStars === String(n))}
                    >
                      {n}★+
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2.5">Age</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {AGE_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          age: o.id,
                          ageMin: "",
                          ageMax: "",
                        }))
                      }
                      className={chipClass(
                        draft.age === o.id && !draft.ageMin && !draft.ageMax
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft.ageMin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ageMin: e.target.value,
                        age: "any",
                      }))
                    }
                    placeholder="Min hours"
                    className={inputClass}
                  />
                  <span className="text-[#5c6573]">–</span>
                  <input
                    type="number"
                    value={draft.ageMax}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ageMax: e.target.value,
                        age: "any",
                      }))
                    }
                    placeholder="Max hours"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2.5">Market Cap</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {MCAP_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          mcap: o.id,
                          mcapMin: "",
                          mcapMax: "",
                        }))
                      }
                      className={chipClass(
                        draft.mcap === o.id && !draft.mcapMin && !draft.mcapMax
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft.mcapMin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        mcapMin: e.target.value,
                        mcap: "any",
                      }))
                    }
                    placeholder="Min $"
                    className={inputClass}
                  />
                  <span className="text-[#5c6573]">–</span>
                  <input
                    type="number"
                    value={draft.mcapMax}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        mcapMax: e.target.value,
                        mcap: "any",
                      }))
                    }
                    placeholder="Max $"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2.5">Liquidity</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {LIQ_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          liq: o.id,
                          liqMin: "",
                          liqMax: "",
                        }))
                      }
                      className={chipClass(
                        draft.liq === o.id && !draft.liqMin && !draft.liqMax
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft.liqMin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        liqMin: e.target.value,
                        liq: "any",
                      }))
                    }
                    placeholder="Min $"
                    className={inputClass}
                  />
                  <span className="text-[#5c6573]">–</span>
                  <input
                    type="number"
                    value={draft.liqMax}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        liqMax: e.target.value,
                        liq: "any",
                      }))
                    }
                    placeholder="Max $"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2.5">Volume (24h)</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {VOL_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          vol: o.id,
                          volMin: "",
                          volMax: "",
                        }))
                      }
                      className={chipClass(
                        draft.vol === o.id && !draft.volMin && !draft.volMax
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft.volMin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        volMin: e.target.value,
                        vol: "any",
                      }))
                    }
                    placeholder="Min $"
                    className={inputClass}
                  />
                  <span className="text-[#5c6573]">–</span>
                  <input
                    type="number"
                    value={draft.volMax}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        volMax: e.target.value,
                        vol: "any",
                      }))
                    }
                    placeholder="Max $"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2.5">Transactions (24h)</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {TXNS_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          txns: o.id,
                          txnsMin: "",
                          txnsMax: "",
                        }))
                      }
                      className={chipClass(
                        draft.txns === o.id &&
                          !draft.txnsMin &&
                          !draft.txnsMax
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft.txnsMin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        txnsMin: e.target.value,
                        txns: "any",
                      }))
                    }
                    placeholder="Min"
                    className={inputClass}
                  />
                  <span className="text-[#5c6573]">–</span>
                  <input
                    type="number"
                    value={draft.txnsMax}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        txnsMax: e.target.value,
                        txns: "any",
                      }))
                    }
                    placeholder="Max"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2.5">Min 24h Change (%)</p>
                <input
                  type="number"
                  value={draft.changeMin}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, changeMin: e.target.value }))
                  }
                  placeholder="e.g. 10"
                  className={inputClass + " max-w-[180px]"}
                />
              </div>

              <div className="md:hidden flex items-center justify-end gap-3 pt-6 mt-2 pb-24 border-t border-[#1c1f26]">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-[#1c1f26] text-[#8b93a1] hover:text-[#f4f6f8] hover:border-[#3a3f4b] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-[#b8ff3d] text-black hover:bg-[#c8ff5d] transition"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="hidden md:flex items-center justify-end gap-3 px-5 py-4 border-t border-[#1c1f26]">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[#1c1f26] text-[#8b93a1] hover:text-[#f4f6f8] hover:border-[#3a3f4b] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[#b8ff3d] text-black hover:bg-[#c8ff5d] transition"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DESKTOP TABLE ===== */}
      <div className="hidden md:block border border-[#1c1f26] rounded-xl">
        <div
          ref={desktopHeaderRef}
          className="sticky z-30 grid grid-cols-[40px_2.2fr_1fr_1fr_1fr_1fr_0.9fr_0.7fr_0.8fr] gap-0 text-xs font-bold text-[#f4f6f8] uppercase tracking-wider border-b border-[#2a2e38] bg-[#1c1f26] rounded-t-xl"
          style={{ top: "3rem" }}
        >
          <div className="px-1 py-3 text-center">#</div>
          <div
            className="px-3 py-3 border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center gap-1"
            onClick={() => handleSort("symbol")}
          >
            Token <SortIcon active={sortKey === "symbol"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("marketCap")}
          >
            Mcap{" "}
            <SortIcon active={sortKey === "marketCap"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("priceUsd")}
          >
            Price{" "}
            <SortIcon active={sortKey === "priceUsd"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("change24h")}
          >
            24h{" "}
            <SortIcon active={sortKey === "change24h"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("volume24h")}
          >
            Volume{" "}
            <SortIcon active={sortKey === "volume24h"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("liquidity")}
          >
            Liq{" "}
            <SortIcon active={sortKey === "liquidity"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right border-r border-[#2a2e38] cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("rating")}
          >
            ★{" "}
            <SortIcon active={sortKey === "rating"} direction={sortDir} />
          </div>
          <div
            className="px-3 py-3 text-right cursor-pointer select-none hover:text-white flex items-center justify-end gap-1"
            onClick={() => handleSort("age")}
          >
            Age <SortIcon active={sortKey === "age"} direction={sortDir} />
          </div>
        </div>

        {pageTokens.length === 0 ? (
          <div className="p-12 text-center text-[#8b93a1]">
            {showWatchlistOnly
              ? "your watchlists will live here"
              : "No tokens found."}
          </div>
        ) : (
          pageTokens.map((token, index) => {
            const isPinned = !!token.is_pinned;

            return (
              <Link
                key={token.id}
                href={`/${token.chain}/${token.address}`}
                className={`grid grid-cols-[40px_2.2fr_1fr_1fr_1fr_1fr_0.9fr_0.7fr_0.8fr] gap-0 items-center transition ${
                  isPinned
                    ? "bg-[#b8ff3d]/[0.04] border-y border-[#b8ff3d]/20"
                    : "hover:bg-[#14171d]"
                } ${
                  index !== pageTokens.length - 1 && !isPinned
                    ? "border-b border-[#1c1f26]"
                    : ""
                }`}
              >
                <div className="px-1 py-3 text-center text-sm text-[#8b93a1]">
                  {isPinned ? (
                    <span className="text-[#b8ff3d] text-xs font-medium">P</span>
                  ) : (
                    startIndex + index + 1
                  )}
                </div>

                <div className="px-3 py-3 border-r border-[#1c1f26] flex items-center gap-3 min-w-0">
                  {token.image_url ? (
                    <Image
                      src={token.image_url}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-[#1c1f26] flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">
                        {token.symbol || "???"}
                      </span>
                      {isPinned && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#b8ff3d]/10 text-[#8b93a1]">
                          Partnership
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#8b93a1] truncate">
                      {token.name || token.address.slice(0, 10) + "…"}
                    </div>
                  </div>
                </div>

                <div className="px-3 py-3 text-right text-[15px] border-r border-[#1c1f26]">
                  {formatUsd(token.stats?.marketCap ?? null)}
                </div>
                <div className="px-3 py-3 text-right text-[15px] border-r border-[#1c1f26]">
                  {formatUsd(token.stats?.priceUsd ?? null)}
                </div>
                <div
                  className={`px-3 py-3 text-right text-[15px] border-r border-[#1c1f26] ${
                    (token.stats?.change24h ?? 0) < 0
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {formatPct(token.stats?.change24h ?? null)}
                </div>
                <div className="px-3 py-3 text-right text-[15px] border-r border-[#1c1f26]">
                  {formatUsd(token.stats?.volume24h ?? null)}
                </div>
                <div className="px-3 py-3 text-right text-[15px] border-r border-[#1c1f26]">
                  {formatUsd(token.stats?.liquidity ?? null)}
                </div>
                <div className="px-3 py-3 text-right text-[15px] border-r border-[#1c1f26] tabular-nums">
                  ★{token.ratingAvg ?? 0}
                </div>
                <div className="px-3 py-3 text-right text-[15px] text-[#8b93a1]">
                  {formatAge(token.stats?.pairCreatedAt ?? null)}
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* ===== MOBILE TABLE ===== */}
      <div className="md:hidden border border-[#1c1f26] rounded-xl overflow-hidden">
        {pageTokens.length === 0 ? (
          <div className="p-10 text-center text-[#8b93a1]">
            {showWatchlistOnly
              ? "your watchlists will live here"
              : "No tokens found."}
          </div>
        ) : (
          pageTokens.map((token, index) => {
            const isPinned = !!token.is_pinned;

            return (
              <Link
                key={token.id}
                href={`/${token.chain}/${token.address}`}
                className={`block transition ${
                  isPinned
                    ? "bg-[#b8ff3d]/[0.04] border-y border-[#b8ff3d]/20"
                    : "hover:bg-[#14171d]"
                } ${
                  index !== pageTokens.length - 1 && !isPinned
                    ? "border-b border-[#1c1f26]"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  {token.image_url ? (
                    <Image
                      src={token.image_url}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-[#1c1f26] flex-shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[14px] truncate">
                        {token.symbol || "???"}
                      </span>
                      {isPinned && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#b8ff3d]/10 text-[#8b93a1]">
                          Partnership
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-[#8b93a1] truncate">
                      {token.name || token.address.slice(0, 10) + "…"}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="font-medium text-[14px]">
                      {formatUsd(token.stats?.priceUsd ?? null)}
                    </div>
                    <div
                      className={`text-[12px] ${
                        (token.stats?.change24h ?? 0) < 0
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {formatPct(token.stats?.change24h ?? null)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-0.5 px-2 pb-2.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#2a2e36] bg-[#0f1115] text-[11px] font-medium whitespace-nowrap">
                    <span className="text-[#8b93a1]">MCAP</span>
                    <span className="text-[#f4f6f8] ml-0.5">
                      {formatUsd(token.stats?.marketCap ?? null)}
                    </span>
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#2a2e36] bg-[#0f1115] text-[11px] font-medium whitespace-nowrap">
                    <span className="text-[#8b93a1]">VOL</span>
                    <span className="text-[#f4f6f8] ml-0.5">
                      {formatUsd(token.stats?.volume24h ?? null)}
                    </span>
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#2a2e36] bg-[#0f1115] text-[11px] font-medium whitespace-nowrap">
                    <span className="text-[#8b93a1]">LIQ</span>
                    <span className="text-[#f4f6f8] ml-0.5">
                      {formatUsd(token.stats?.liquidity ?? null)}
                    </span>
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#2a2e36] bg-[#0f1115] text-[11px] font-medium whitespace-nowrap tabular-nums">
                    ★{token.ratingAvg ?? 0}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#2a2e36] bg-[#0f1115] text-[11px] font-medium text-[#8b93a1] whitespace-nowrap">
                    {formatAge(token.stats?.pairCreatedAt ?? null)}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm border border-[#1c1f26] text-[#8b93a1] disabled:opacity-40 hover:border-[#3a3f4b] hover:text-white transition"
          >
            Prev
          </button>
          <span className="text-sm text-[#8b93a1]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm border border-[#1c1f26] text-[#8b93a1] disabled:opacity-40 hover:border-[#3a3f4b] hover:text-white transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}