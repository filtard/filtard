import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[#1c1f26] mt-12 md:mt-16">
      <div className="px-3 py-8 md:px-6 md:py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-[0.05em]"
            >
              <img
                src="/logo.png"
                alt="Filtard"
                className="h-7 w-7 rounded-md object-contain"
              />
              Filtard
            </Link>
            <p className="text-sm text-[#8b93a1] max-w-xs">
              Community-curated memecoin screener with theses, ratings, and live data.
            </p>
          </div>

          {/* Social + Links */}
          <div className="flex flex-col sm:flex-row gap-8 sm:gap-12">
            {/* Social */}
            <div>
              <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-3">
                Social
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="https://x.com/filtard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-[#8b93a1] hover:text-white hover:bg-[#1c1f26] transition"
                  aria-label="X"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://t.me/filtard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-[#8b93a1] hover:text-white hover:bg-[#1c1f26] transition"
                  aria-label="Telegram"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.36-.49.99-.75 3.89-1.69 6.49-2.81 7.79-3.35 3.72-1.54 4.49-1.81 4.99-1.82.11 0 .35.03.51.14.13.09.17.21.19.3-.01.06.01.24 0 .38z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Legal / About */}
            <div>
              <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-3">
                Links
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/performance"
                  className="text-sm text-[#8b93a1] hover:text-[#b8ff3d] transition"
                >
                  Performance
                </Link>
                <Link
                  href="/rewards"
                  className="text-sm text-[#8b93a1] hover:text-[#b8ff3d] transition"
                >
                  Rewards
                </Link>
                <Link
                  href="/about"
                  className="text-sm text-[#8b93a1] hover:text-[#b8ff3d] transition"
                >
                  About
                </Link>
                <Link
                  href="/privacy"
                  className="text-sm text-[#8b93a1] hover:text-[#b8ff3d] transition"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="text-sm text-[#8b93a1] hover:text-[#b8ff3d] transition"
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-8 pt-6 border-t border-[#1c1f26]">
          <p className="text-xs text-[#6b7280]">
            © {new Date().getFullYear()} Filtard. Not financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
