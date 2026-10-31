export const RESERVED_USERNAMES = [
  "admin",
  "dashboard",
  "login",
  "profile",
  "submissions",
  "setup-username",
  "auth",
  "api",
  "token",
  "curator",
  "about",
  "privacy",
  "terms",
  "leaderboard",
  "rewards",
  "solana",
  "base",
  "ethereum",
  "bsc",
  "arbitrum",
  "robinhood",
  "filtard",
  "www",
  "submit",
] as const;

export function isReservedUsername(name: string): boolean {
  return (RESERVED_USERNAMES as readonly string[]).includes(
    name.trim().toLowerCase()
  );
}

// Names that are blocked for signup/profile edits but still resolve as a
// profile page because an official account owns them.
export const OFFICIAL_USERNAMES = ["filtard"] as const;

export function isReservedRoute(name: string): boolean {
  const clean = name.trim().toLowerCase();
  if ((OFFICIAL_USERNAMES as readonly string[]).includes(clean)) return false;
  return isReservedUsername(clean);
}
