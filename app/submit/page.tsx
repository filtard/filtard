"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, supabase } from "@/lib/auth";
import { SUBMIT_CHAINS } from "@/lib/chains";
import { isStaffRole } from "@/lib/roles";
import Link from "next/link";

export default function SubmitPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [chain, setChain] = useState("solana");
  const [address, setAddress] = useState("");
  const [thesis, setThesis] = useState("");
  const [confidence, setConfidence] = useState(50);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    async function checkUser() {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
      setLoadingUser(false);
    }
    checkUser();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setMessage("Error: Not authenticated");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/tokens/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          chain,
          address: address.trim(),
          thesis: thesis.trim(),
          confidence,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const symbol = data?.symbol || "Token";

      if (!res.ok) {
        if (res.status === 409 || data?.error === "already_added") {
          setMessage(data?.message || `${symbol} already added`);
        } else {
          setMessage("Error: " + (data?.error || "Could not submit"));
        }
      } else if (data?.status === "approved") {
        setMessage(`Successfully added ${symbol}!`);
        setAddress("");
        setThesis("");
        setConfidence(50);
        setConfirmed(false);
      } else {
        setMessage(`${symbol} submitted for approval!`);
        setAddress("");
        setThesis("");
        setConfidence(50);
        setConfirmed(false);
      }
    } catch {
      setMessage("Error: Could not submit");
    }

    setLoading(false);
  }

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-[#8b93a1]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh] py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Submit a Token
          </h1>
          <p className="mt-3 text-[#8b93a1] text-sm">
            We only approve tokens with strong memetics.
          </p>
        </div>

        {/* Checklist Card */}
        <div className="mb-8 rounded-2xl border border-[#1c1f26] bg-[#0c0d10] p-6">
          <p className="text-sm text-[#8b93a1] mb-3">Must have:</p>

          <ul className="space-y-2.5 text-sm text-[#f4f6f8]">
            <li className="flex items-start gap-2.5">
              <span className="text-[#b8ff3d] mt-0.5">✓</span>
              <span>Meaningful lore, strong thesis, and clear narrative</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-[#b8ff3d] mt-0.5">✓</span>
              <span>Organic traction and an active community</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-[#b8ff3d] mt-0.5">✓</span>
              <span>Actually funny or highly relatable</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-[#b8ff3d] mt-0.5">✓</span>
              <span>Strong staying power (not pure one-day hype plays)</span>
            </li>
          </ul>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-[#1c1f26] bg-[#0c0d10] p-6">
          <h2 className="text-sm font-medium text-[#f4f6f8] mb-5">
            Enter token details
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-[#8b93a1] mb-1.5">
                Chain
              </label>
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#b8ff3d]/50 transition"
              >
                {SUBMIT_CHAINS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-[#8b93a1] mb-1.5">
                Contract Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                placeholder="Paste contract address"
                className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-3 text-sm text-white placeholder:text-[#5c6573] focus:outline-none focus:border-[#b8ff3d]/50 transition"
              />
            </div>

            {/* Thesis Field */}
            <div>
              <label className="block text-sm text-[#8b93a1] mb-1.5">
                Thesis <span className="text-red-400">*</span>
              </label>
              <textarea
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                required
                rows={10}
                maxLength={3000}
                placeholder={`Write a clear, high-signal thesis.

Supports:
• Bold: **text**
• Bullets: - item
• Links: [text](https://...)

Example style:
$MADE is tied to an AI agent experiment that routes trading fees...`}
                className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-3 text-sm text-white placeholder:text-[#5c6573] focus:outline-none focus:border-[#b8ff3d]/50 transition resize-y min-h-[180px]"
              />
              <div className="mt-1.5 flex justify-between text-xs text-[#5c6573]">
                <span>Bold, bullets & links supported</span>
                <span>{thesis.length}/3000</span>
              </div>
            </div>

            {/* Confidence Score */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-[#8b93a1]">
                  Confidence score
                </label>
                <span className="text-sm font-medium text-[#4ade80]">
                  {confidence}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-[#4ade80]"
              />
              <p className="text-xs text-[#5c6573]">
                How strong is your conviction in this thesis?
              </p>
            </div>

            {/* Confirmation Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer select-none pt-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#3a3f4b] bg-[#101215] text-[#b8ff3d] focus:ring-[#b8ff3d]/50"
              />
              <span className="text-sm text-[#f4f6f8] leading-snug">
                Yes, I confirm this token meets every requirement above
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !confirmed || !thesis.trim()}
              className="w-full rounded-xl bg-[#b8ff3d] py-3.5 font-medium text-black hover:bg-[#a3e635] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Submitting..." : "Submit Token"}
            </button>
          </form>

          {message && (
            <p
              className={`mt-5 text-sm text-center ${
                message.includes("already added") || message.startsWith("Error")
                  ? "text-red-400"
                  : "text-green-400"
              }`}
            >
              {message}
            </p>
          )}

          {isStaffRole(user.role) && (
            <div className="mt-8 text-center">
              <Link
                href="/dashboard"
                className="text-sm text-[#b8ff3d] hover:underline"
              >
                Go to Admin Dashboard →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}