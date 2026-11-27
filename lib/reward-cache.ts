import { revalidatePath, revalidateTag } from "next/cache";
import { purgeEdgePages } from "@/lib/edge-cache";

export function refreshRewardPages(
  slug?: string | null,
  previousSlug?: string | null
) {
  try {
    revalidateTag("rewards", "max");
    revalidatePath("/rewards");
    revalidatePath("/", "layout");
    if (slug) revalidatePath(`/rewards/${slug}`);
    if (previousSlug && previousSlug !== slug) {
      revalidatePath(`/rewards/${previousSlug}`);
    }
    purgeEdgePages(
      ["/", "/rewards", slug ? `/rewards/${slug}` : "", previousSlug ? `/rewards/${previousSlug}` : ""].filter(Boolean)
    );
  } catch (err) {
    console.error("reward revalidate failed:", err);
  }
}
