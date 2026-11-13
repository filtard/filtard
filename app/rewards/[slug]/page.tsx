import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RewardBody from "@/app/components/RewardBody";
import { ExpiredLabel } from "@/app/components/RewardCard";
import { getPublishedReward } from "@/lib/reward-public";
import { formatRewardDate, isRewardExpired } from "@/lib/rewards";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 60;

// Render each post on first visit, then serve it from cache (ISR).
export async function generateStaticParams() {
  return [];
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedReward(slug);
  if (!post) {
    return { title: "Reward" };
  }

  const siteUrl = getSiteUrl();
  const description = post.subtitle || post.title;
  const images = post.cover_image_url
    ? [{ url: post.cover_image_url, alt: post.title }]
    : undefined;

  return {
    title: post.title,
    description,
    openGraph: {
      title: post.title,
      description,
      url: `${siteUrl}/rewards/${post.slug}`,
      siteName: "Filtard",
      type: "article",
      images,
    },
    twitter: {
      card: post.cover_image_url ? "summary_large_image" : "summary",
      title: post.title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function RewardPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedReward(slug);
  if (!post) notFound();

  const expired = isRewardExpired(post.expires_at);
  const postedOn = formatRewardDate(post.created_at);

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        href="/rewards"
        className="text-sm text-[#8b93a1] transition hover:text-[#b8ff3d]"
      >
        All rewards
      </Link>

      {post.cover_image_url ? (
        <img
          src={post.cover_image_url}
          alt={post.title}
          className="mt-5 max-h-[420px] w-full rounded-2xl border border-[#1c1f26] object-cover"
        />
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {expired ? <ExpiredLabel /> : null}
        {postedOn ? (
          <time dateTime={post.created_at} className="text-xs text-[#6b7280]">
            {postedOn}
          </time>
        ) : null}
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
        {post.title}
      </h1>
      {post.subtitle ? (
        <p className="mt-2 text-base text-[#8b93a1] md:text-lg">{post.subtitle}</p>
      ) : null}

      <div className="mt-8">
        <RewardBody html={post.body} />
      </div>
    </article>
  );
}
