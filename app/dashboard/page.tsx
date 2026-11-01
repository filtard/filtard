"use client";

import VerifiedBadge from "@/app/components/VerifiedBadge";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabase } from "@/lib/auth";
import { isStaffRole } from "@/lib/roles";

const RewardsAdmin = dynamic(() => import("./rewards-admin"), {
  loading: () => <p className="text-sm text-[#8b93a1]">Loading...</p>,
});

type Profile = {
  id: string;
  display_name: string | null;
  role: string;
  twitter_url: string | null;
  telegram_url: string | null;
  avatar_url: string | null;
  token_count?: number;
};

type Token = {
  id: string;
  chain: string;
  address: string;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  status: string;
  is_pinned: boolean;
  created_at: string;
  submitted_by: string | null;
  thesis: string | null;
  profiles?: {
    id: string;
    display_name: string | null;
    role?: string | null;
  } | null;
};

type RowFeedback = {
  text: string;
  type: "success" | "error";
};

type Toast = {
  id: number;
  text: string;
  type: "success" | "error";
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<
    "tokens" | "curators" | "rewards"
  >("tokens");
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [search, setSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [profilesError, setProfilesError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>(
    {}
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const feedbackTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  const [thesisModal, setThesisModal] = useState<{
    open: boolean;
    symbol: string;
    thesis: string;
  }>({ open: false, symbol: "", thesis: "" });

  const isSuperAdmin = user?.role === "super_admin";

  const showRowFeedback = useCallback(
    (id: string, text: string, type: "success" | "error" = "success") => {
      if (feedbackTimers.current[id]) {
        clearTimeout(feedbackTimers.current[id]);
      }
      setRowFeedback((prev) => ({ ...prev, [id]: { text, type } }));
      feedbackTimers.current[id] = setTimeout(() => {
        setRowFeedback((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        delete feedbackTimers.current[id];
      }, 2000);
    },
    []
  );

  const showToast = useCallback(
    (text: string, type: "success" | "error" = "success") => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2500);
    },
    []
  );

  const loadProfiles = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;

    if (!accessToken) {
      setProfilesError("Not authenticated");
      return;
    }

    const res = await fetch("/api/admin/profiles", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setProfilesError(data?.error || "Could not load users");
      return;
    }

    setProfilesError("");
    setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
  }, []);

  useEffect(() => {
    async function init() {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        router.push("/login");
        return;
      }

      setUser(currentUser);

      if (!isStaffRole(currentUser.role)) {
        setLoading(false);
        return;
      }

      await Promise.all([loadTokens(), loadProfiles()]);
      setLoading(false);
    }

    init();
  }, [router, loadProfiles]);

  async function loadTokens() {
    const { data, error } = await supabase
      .from("tokens")
      .select(
        `
        id,
        chain,
        address,
        name,
        symbol,
        image_url,
        status,
        is_pinned,
        created_at,
        submitted_by,
        thesis,
        profiles!submitted_by (
          id,
          display_name,
          role
        )
      `
      )
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTokens(data as any);
    }
  }

  async function getAccessToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function updateRole(userId: string, newRole: string) {
    if (userId === user.id) {
      showToast("You cannot change your own role", "error");
      return;
    }

    const target = profiles.find((p) => p.id === userId);
    if (target?.role === "super_admin") {
      showToast("Super admin role cannot be changed", "error");
      return;
    }

    if (target?.role === "admin" && !isSuperAdmin) {
      showToast("Only a super admin can change an admin", "error");
      return;
    }

    if (newRole === "admin" && !isSuperAdmin) {
      showToast("Only a super admin can assign the admin role", "error");
      return;
    }

    if (newRole === "super_admin") {
      showToast("Cannot assign super admin role", "error");
      return;
    }

    const previousRole = target?.role;
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, role: newRole } : p))
    );

    const accessToken = await getAccessToken();
    if (!accessToken) {
      showToast("Not authenticated", "error");
      await loadProfiles();
      return;
    }

    const res = await fetch("/api/admin/update-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId, role: newRole }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(data?.error || "Error updating role", "error");
      if (previousRole) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === userId ? { ...p, role: previousRole } : p
          )
        );
      } else {
        await loadProfiles();
      }
    } else {
      showToast("Role updated");
    }
  }

  async function approveTokensViaApi(ids: string[]) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { error: "Not authenticated" };
    }

    const res = await fetch("/api/admin/approve-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ids }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { error: data?.error || `Request failed (${res.status})` };
    }

    return { error: null };
  }

  async function approveToken(id: string) {
    const { error } = await approveTokensViaApi([id]);

    if (error) {
      showRowFeedback(id, "Error", "error");
    } else {
      showRowFeedback(id, "Approved", "success");
      setSelected((prev) => prev.filter((x) => x !== id));
      setTimeout(() => loadTokens(), 600);
    }
  }

  async function deleteTokensViaApi(ids: string[]) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { error: "Not authenticated" };
    }

    const res = await fetch("/api/admin/delete-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ids }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { error: data?.error || `Request failed (${res.status})` };
    }

    return { error: null };
  }

  async function togglePin(id: string, currentlyPinned: boolean) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      showRowFeedback(id, "Error", "error");
      return;
    }

    const nextPinned = !currentlyPinned;
    setTokens((prev) =>
      prev.map((token) => {
        if (token.id === id) return { ...token, is_pinned: nextPinned };
        if (nextPinned) return { ...token, is_pinned: false };
        return token;
      })
    );

    const res = await fetch("/api/admin/pin-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ id, pinned: nextPinned }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showRowFeedback(id, "Error", "error");
      showToast(data?.error || "Could not update pin", "error");
      await loadTokens();
      return;
    }

    showRowFeedback(id, nextPinned ? "Pinned" : "Unpinned", "success");
    setTimeout(() => loadTokens(), 600);
  }

  async function deleteToken(id: string) {
    if (!confirm("Are you sure you want to delete this token?")) return;

    const { error } = await deleteTokensViaApi([id]);

    if (error) {
      showRowFeedback(id, "Error", "error");
    } else {
      showRowFeedback(id, "Deleted", "success");
      setSelected((prev) => prev.filter((x) => x !== id));
      setTimeout(() => loadTokens(), 600);
    }
  }

  async function bulkApprove() {
    if (selected.length === 0) return;
    if (!confirm(`Approve ${selected.length} tokens?`)) return;

    showToast("Approving...");

    const { error } = await approveTokensViaApi(selected);

    if (error) {
      showToast("Bulk approve failed: " + error, "error");
    } else {
      showToast(`${selected.length} approved`);
      setSelected([]);
      await loadTokens();
    }
  }

  async function bulkDelete() {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} tokens permanently?`)) return;

    const { error } = await deleteTokensViaApi(selected);

    if (error) {
      showToast("Bulk delete failed: " + error, "error");
    } else {
      showToast(`${selected.length} deleted`);
      setSelected([]);
      await loadTokens();
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selected.length === filteredTokens.length) {
      setSelected([]);
    } else {
      setSelected(filteredTokens.map((t) => t.id));
    }
  }

  const visibleProfiles = profiles.filter((profile) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (profile.display_name || "").toLowerCase().includes(q);
  });

  const filteredTokens = tokens.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    const q = search.toLowerCase();
    return (
      t.symbol?.toLowerCase().includes(q) ||
      t.name?.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q) ||
      t.profiles?.display_name?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-[#8b93a1]">Loading...</p>
      </div>
    );
  }

  if (!isStaffRole(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <p className="text-[#f4f6f8]">Admins only</p>
        <Link href="/" className="text-sm text-[#b8ff3d] hover:underline">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto relative">
      <div className="fixed top-4 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-[100] flex flex-col gap-2 w-[min(100%-2rem,320px)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-md ${
              t.type === "error"
                ? "bg-[#1a1010]/95 border-red-500/40 text-red-300"
                : "bg-[#101215]/95 border-[#2a2e38] text-[#f4f6f8]"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("tokens")}
          className={`px-4 py-2 rounded-xl text-sm border transition ${
            activeTab === "tokens"
              ? "bg-[#b8ff3d] text-black border-[#b8ff3d]"
              : "border-[#1c1f26] text-[#8b93a1] hover:border-[#3a3f4b]"
          }`}
        >
          Tokens
        </button>
        <button
          onClick={() => setActiveTab("curators")}
          className={`px-4 py-2 rounded-xl text-sm border transition ${
            activeTab === "curators"
              ? "bg-[#b8ff3d] text-black border-[#b8ff3d]"
              : "border-[#1c1f26] text-[#8b93a1] hover:border-[#3a3f4b]"
          }`}
        >
          Curators
        </button>
        <button
          onClick={() => setActiveTab("rewards")}
          className={`px-4 py-2 rounded-xl text-sm border transition ${
            activeTab === "rewards"
              ? "bg-[#b8ff3d] text-black border-[#b8ff3d]"
              : "border-[#1c1f26] text-[#8b93a1] hover:border-[#3a3f4b]"
          }`}
        >
          Rewards
        </button>
      </div>

      {activeTab === "tokens" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, symbol, address or curator..."
              className="flex-1 rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-2.5 text-sm placeholder:text-[#5c6573] focus:outline-none focus:border-[#3a3f4b]"
            />

            <div className="flex gap-2">
              {(["all", "pending", "approved"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm border transition ${
                    filter === f
                      ? "bg-[#b8ff3d] text-black border-[#b8ff3d]"
                      : "border-[#1c1f26] text-[#8b93a1] hover:border-[#3a3f4b]"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {selected.length > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3.5 rounded-xl bg-[#101215] border border-[#1c1f26]">
              <span className="text-sm text-[#8b93a1]">
                {selected.length} selected
              </span>
              <button
                onClick={bulkApprove}
                className="px-3.5 py-1.5 rounded-lg bg-[#b8ff3d] text-black text-sm font-medium hover:bg-[#a3e635]"
              >
                Approve Selected
              </button>
              <button
                onClick={bulkDelete}
                className="px-3.5 py-1.5 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-500/10"
              >
                Delete Selected
              </button>
              <button
                onClick={() => setSelected([])}
                className="text-sm text-[#8b93a1] hover:text-white"
              >
                Clear
              </button>
            </div>
          )}

          {filteredTokens.length === 0 ? (
            <div className="border border-[#1c1f26] rounded-2xl p-16 text-center text-[#8b93a1]">
              No tokens found
            </div>
          ) : (
            <div className="border border-[#1c1f26] rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-3 bg-[#0c0d10] border-b border-[#1c1f26] text-xs text-[#8b93a1]">
                <div className="w-5">
                  <input
                    type="checkbox"
                    checked={
                      selected.length === filteredTokens.length &&
                      filteredTokens.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-[#3a3f4b] bg-[#101215]"
                  />
                </div>
                <div>Token</div>
                <div className="text-right">Actions</div>
              </div>

              {filteredTokens.map((token) => {
                const fb = rowFeedback[token.id];

                return (
                  <div
                    key={token.id}
                    className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-4 border-b border-[#1c1f26] last:border-0 hover:bg-[#14171d] transition"
                  >
                    <div className="w-5">
                      <input
                        type="checkbox"
                        checked={selected.includes(token.id)}
                        onChange={() => toggleSelect(token.id)}
                        className="rounded border-[#3a3f4b] bg-[#101215]"
                      />
                    </div>

                    <div className="flex items-center gap-3.5 min-w-0">
                      {token.image_url ? (
                        <img
                          src={token.image_url}
                          alt=""
                          className="h-11 w-11 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-[#1c1f26] flex-shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/${token.chain}/${token.address}`}
                            className="font-medium hover:text-[#b8ff3d] transition"
                          >
                            {token.symbol || "???"}
                          </Link>
                          <span className="text-[11px] text-[#8b93a1] border border-[#1c1f26] px-1.5 rounded">
                            {token.chain}
                          </span>
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded ${
                              token.status === "approved"
                                ? "bg-green-500/15 text-green-400"
                                : "bg-yellow-500/15 text-yellow-400"
                            }`}
                          >
                            {token.status}
                          </span>
                          {token.is_pinned && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#b8ff3d]/10 text-[#8b93a1]">
                              Partnership
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-[#8b93a1] truncate mt-0.5">
                          {token.name || token.address}
                        </div>

                        <div className="text-xs text-[#5c6573] mt-1">
                          Submitted by{" "}
                          {token.profiles?.display_name ? (
                            <Link
                              href={`/${token.profiles.display_name}`}
                              className="text-[#b8ff3d] hover:underline"
                            >
                              {token.profiles.display_name}
                            </Link>
                          ) : null}
                          {token.profiles?.display_name ? (
                            <VerifiedBadge role={token.profiles.role ?? null} />
                          ) : (
                            "Unknown"
                          )}{" "}
                          on {new Date(token.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 flex-shrink-0 min-w-[140px]">
                      {fb ? (
                        <span
                          className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
                            fb.type === "error"
                              ? "text-red-400 bg-red-500/10"
                              : "text-[#b8ff3d] bg-[#b8ff3d]/10"
                          }`}
                        >
                          {fb.text}
                        </span>
                      ) : (
                        <>
                          {token.thesis && (
                            <button
                              onClick={() =>
                                setThesisModal({
                                  open: true,
                                  symbol: token.symbol || "Token",
                                  thesis: token.thesis || "",
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-[#2a2e38] text-[#8b93a1] text-sm hover:text-white hover:border-[#3a3f4b] transition"
                            >
                              View Thesis
                            </button>
                          )}

                          <button
                            onClick={() =>
                              togglePin(token.id, !!token.is_pinned)
                            }
                            className="px-3.5 py-1.5 rounded-lg border border-[#2a2e38] text-[#8b93a1] text-sm hover:text-white hover:border-[#3a3f4b] transition"
                          >
                            {token.is_pinned ? "Unpin" : "Pin"}
                          </button>
                          {token.status === "pending" && (
                            <button
                              onClick={() => approveToken(token.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-[#b8ff3d] text-black text-sm font-medium hover:bg-[#a3e635] transition"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            onClick={() => deleteToken(token.id)}
                            className="px-3.5 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10 transition"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "rewards" && <RewardsAdmin />}

      {activeTab === "curators" && (
        <div>
          <div className="mb-4">
            <label className="block text-sm text-[#8b93a1] mb-1.5" htmlFor="user-search">
              Username
            </label>
            <input
              id="user-search"
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search username"
              className="w-full rounded-xl border border-[#1c1f26] bg-[#101215] px-4 py-2.5 text-sm placeholder:text-[#5c6573] focus:outline-none focus:border-[#3a3f4b]"
            />
          </div>

          <div className="border border-[#1c1f26] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px] gap-4 px-5 py-3.5 bg-[#0c0d10] border-b border-[#1c1f26] text-xs text-[#8b93a1] uppercase tracking-wider">
            <div>User</div>
            <div className="text-center">Tokens</div>
            <div className="text-right">Role</div>
          </div>

          {profilesError ? (
            <div className="p-16 text-center text-red-400">{profilesError}</div>
          ) : profiles.length === 0 ? (
            <div className="p-16 text-center text-[#8b93a1]">No users yet</div>
          ) : visibleProfiles.length === 0 ? (
            <div className="p-16 text-center text-[#8b93a1]">
              No matching users
            </div>
          ) : (
            visibleProfiles.map((profile) => {
              const isLocked =
                profile.role === "super_admin" ||
                (profile.role === "admin" && !isSuperAdmin);

              return (
                <div
                  key={profile.id}
                  className="grid grid-cols-[1fr_120px_120px] gap-4 items-center px-5 py-4 border-b border-[#1c1f26] last:border-0 hover:bg-[#14171d] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-[#1c1f26] flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {(profile.display_name || "U")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/${profile.display_name}`}
                        className="font-medium hover:text-[#b8ff3d] transition"
                      >
                        {profile.display_name || "Anonymous"}
                      </Link>
                      <VerifiedBadge role={profile.role} />
                    </div>
                  </div>

                  <div className="text-center font-medium">
                    {profile.token_count}
                  </div>

                  <div className="text-right">
                    {isLocked ? (
                      <span className="inline-block rounded-lg border border-[#1c1f26] bg-[#0c0d10] px-2.5 py-1.5 text-sm text-[#8b93a1]">
                        {profile.role}
                      </span>
                    ) : (
                      <select
                        value={profile.role}
                        aria-label={`Role for ${profile.display_name || "user"}`}
                        onChange={(e) =>
                          updateRole(profile.id, e.target.value)
                        }
                        disabled={profile.id === user?.id}
                        className="rounded-lg border border-[#1c1f26] bg-[#101215] px-2 py-1.5 text-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="user">user</option>
                        <option value="curator">curator</option>
                        {isSuperAdmin && <option value="admin">admin</option>}
                        {!isSuperAdmin && profile.role === "admin" && (
                          <option value="admin">admin</option>
                        )}
                      </select>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      )}

      {thesisModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() =>
              setThesisModal({ open: false, symbol: "", thesis: "" })
            }
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#1c1f26] bg-[#101215] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {thesisModal.symbol} thesis
              </h2>
              <button
                onClick={() =>
                  setThesisModal({ open: false, symbol: "", thesis: "" })
                }
                className="text-[#8b93a1] hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <div className="text-sm text-[#c8cdd5] whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
              {thesisModal.thesis}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}