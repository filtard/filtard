"use client";

import { useState, useEffect } from "react";
import { getCurrentUser, supabase } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  tokenId: string | null;
  initialThesis: string | null;
  submittedBy: string | null;
  symbol: string;
  name?: string | null;
  initialConfidence: number | null;
  thesisUpdatedAt: string | null;
  thesisUpdatedByName: string | null;
  thesisUpdatedByDisplay: string | null;
  viewCount: number;
};

function renderThesis(text: string) {
  if (!text) return null;

  let html = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#b8ff3d] hover:underline">$1</a>'
  );

  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong class='text-white'>$1</strong>");

  const lines = html.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2.5">
          <span className="text-[#b8ff3d] mt-0.5 flex-shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: trimmed.slice(2) }} />
        </div>
      );
    } else {
      elements.push(
        <p key={i} dangerouslySetInnerHTML={{ __html: trimmed }} />
      );
    }
  });

  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-[#c8cdd5]">
      {elements}
    </div>
  );
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function ConfidenceBattery({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const opacity = 0.25 + (pct / 100) * 0.55;
  const fillColor = `rgba(74, 222, 128, ${opacity})`;

  return (
    <div className="mt-5">
      <div className="mb-1.5">
        <span className="text-xs font-medium text-[#8b93a1]">Confidence score</span>
      </div>

      <div className="relative h-3.5 w-full rounded-full bg-[#14171d] overflow-hidden border border-[#2a2e38]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: fillColor,
            boxShadow: pct > 60 ? `0 0 12px rgba(74, 222, 128, ${opacity * 0.6})` : "none",
          }}
        />

        {pct >= 15 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="text-[11px] font-bold tracking-wide"
              style={{
                color: pct > 45 ? "#0a0b0e" : "#4ade80",
              }}
            >
              {pct}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThesisCard({
  tokenId,
  initialThesis,
  submittedBy,
  symbol,
  name,
  initialConfidence,
  thesisUpdatedAt,
  thesisUpdatedByName,
  thesisUpdatedByDisplay,
  viewCount,
}: Props) {
  const ticker = (symbol || "").trim().replace(/^\$+/, "").toUpperCase();
  const tokenName = (name || "").trim();
  const thesisHeading = tokenName && ticker
    ? `${tokenName} ($${ticker}) Thesis`
    : ticker
      ? `$${ticker} Thesis`
      : tokenName
        ? `${tokenName} Thesis`
        : "The Thesis";
  const [thesis, setThesis] = useState(initialThesis || "");
  const [confidence, setConfidence] = useState(initialConfidence);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialThesis || "");
  const [draftConfidence, setDraftConfidence] = useState(initialConfidence || 50);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function checkPermission() {
      const user = await getCurrentUser();
      if (!user || !tokenId) {
        setCanEdit(false);
        return;
      }
      const isAdmin = user.role === "admin" || user.role === "super_admin";
      const isCurator = submittedBy && user.id === submittedBy;
      setCanEdit(isAdmin || !!isCurator);
    }
    checkPermission();
  }, [tokenId, submittedBy]);

  async function handleSave() {
    if (!tokenId || !draft.trim()) return;

    setLoading(true);
    setMessage("");

    const user = await getCurrentUser();

    const { error } = await supabase
      .from("tokens")
      .update({
        thesis: draft.trim(),
        confidence: draftConfidence,
        thesis_updated_at: new Date().toISOString(),
        thesis_updated_by: user?.id || null,
      })
      .eq("id", tokenId);

    if (error) {
      setMessage("Error saving thesis");
    } else {
      setThesis(draft.trim());
      setConfidence(draftConfidence);
      setIsEditing(false);
      setMessage("Saved");
      setTimeout(() => setMessage(""), 2000);
      router.refresh();
    }

    setLoading(false);
  }

  // No thesis yet + can edit
  if (!thesis && canEdit) {
    return (
      <div className="mb-8 w-full lg:max-w-2xl lg:mx-auto">
        <div className="rounded-2xl border border-[#2a2e38] bg-[#0a0b0e] py-8 px-5 sm:px-6 text-center">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 text-[#b8ff3d] hover:text-white transition text-sm font-medium"
            >
              <span className="text-xl leading-none">+</span>
              Add Thesis
            </button>
          ) : (
            <div className="text-left space-y-4">
              <h3 className="text-sm font-medium text-[#b8ff3d]">Add Thesis</h3>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={10}
                maxLength={2000}
                placeholder="Write a clear, high-signal thesis. Supports **bold**, - bullets, and [links](url)"
                className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-3 text-sm text-white placeholder:text-[#5c6573] focus:outline-none focus:border-[#b8ff3d]/50 transition resize-y min-h-[180px]"
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8b93a1]">Confidence score</span>
                  <span className="text-sm font-medium text-[#4ade80]">{draftConfidence}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={draftConfidence}
                  onChange={(e) => setDraftConfidence(Number(e.target.value))}
                  className="w-full accent-[#4ade80]"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={loading || !draft.trim()}
                  className="rounded-md bg-[#b8ff3d] px-4 py-2 text-xs font-medium text-black hover:bg-[#a3e635] disabled:opacity-40 transition"
                >
                  {loading ? "Saving..." : "Save Thesis"}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setDraft("");
                  }}
                  className="text-xs text-[#8b93a1] hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
              {message && <p className="text-sm text-green-400">{message}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!thesis) return null;

  return (
    <div className="mb-8 w-full lg:max-w-2xl lg:mx-auto">
      {/* View count - always visible, top right, above the card */}
      <div className="flex justify-end mb-3 px-1">
        <div className="flex items-center gap-1.5 text-xs text-[#8b93a1]">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="opacity-90"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="font-medium tracking-wide tabular-nums">
            {viewCount.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2a2e38] bg-[#0a0b0e] shadow-[0_0_0_1px_rgba(255,255,255,0.03)] py-5 px-5 sm:px-6 relative">
        {/* Top row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-sm font-medium text-[#b8ff3d]">
            {thesisHeading}
          </h1>

          {canEdit && !isEditing && (
            <button
              onClick={() => {
                setDraft(thesis);
                setDraftConfidence(confidence || 50);
                setIsEditing(true);
              }}
              className="text-xs text-[#8b93a1] hover:text-[#b8ff3d] transition"
            >
              Edit
            </button>
          )}
        </div>

        {/* Last edited */}
        {thesisUpdatedAt && thesisUpdatedByDisplay && (
          <div className="mb-4 text-xs text-[#6b7280]">
            Last edited{" "}
            <span title={new Date(thesisUpdatedAt).toLocaleString()}>
              {formatRelativeTime(thesisUpdatedAt)}
            </span>{" "}
            by{" "}
            <Link
              href={`/${thesisUpdatedByName || thesisUpdatedByDisplay}`}
              className="text-[#b8ff3d]/80 hover:text-[#b8ff3d] transition"
            >
              {thesisUpdatedByDisplay}
            </Link>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              maxLength={2000}
              className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#b8ff3d]/50 transition resize-y min-h-[180px]"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b93a1]">Confidence score</span>
                <span className="text-sm font-medium text-[#4ade80]">{draftConfidence}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={draftConfidence}
                onChange={(e) => setDraftConfidence(Number(e.target.value))}
                className="w-full accent-[#4ade80]"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={loading || !draft.trim()}
                className="rounded-md bg-[#b8ff3d] px-4 py-2 text-xs font-medium text-black hover:bg-[#a3e635] disabled:opacity-40 transition"
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setDraft(thesis);
                  setDraftConfidence(confidence || 50);
                }}
                className="text-xs text-[#8b93a1] hover:text-white transition"
              >
                Cancel
              </button>
            </div>
            {message && <p className="text-sm text-green-400">{message}</p>}
          </div>
        ) : (
          <>
            {renderThesis(thesis)}

            {confidence != null && <ConfidenceBattery value={confidence} />}

            <div className="mt-8 pt-4 border-t border-[#1c1f26] flex items-center justify-center gap-6">
              <button
                onClick={() => {
                  const shareText = `$${symbol} thesis by @filtard\n${window.location.href}`;
                  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                className="text-xs text-[#b8ff3d] hover:text-white border border-[#2a2e38] hover:border-[#3a3f4b] bg-[#101215] rounded-lg px-3.5 py-1.5 transition flex items-center gap-1.5"
              >
                Share to
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>

              <a
                href="https://fomo.family/r/filtard"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[#b8ff3d] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#a3e635] transition"
              >
                Trade on Fomo
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}