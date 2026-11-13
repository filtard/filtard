import { revalidatePath } from "next/cache";

/**
 * Pages that list tokens are cached (ISR). Call this after an admin changes
 * which tokens are listed (approve, delete, pin) so the change shows up
 * right away instead of after the cache window.
 */
export function refreshTokenListPages() {
  try {
    revalidatePath("/");
    revalidatePath("/[chain]/[address]", "page");
    revalidatePath("/[username]", "page");
    revalidatePath("/leaderboard");
  } catch (err) {
    console.error("token revalidate failed:", err);
  }
}

/** Refresh one cached token page, e.g. after its thesis is edited. */
export function refreshTokenPage(chain: string, address: string) {
  try {
    revalidatePath(`/${chain}/${address}`);
  } catch (err) {
    console.error("token page revalidate failed:", err);
  }
}
