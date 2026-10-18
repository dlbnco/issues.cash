import Link from "next/link";
import { getWebsiteNetworkName } from "@/lib/network-filter";

export function Footer() {
  const network = getWebsiteNetworkName();

  return (
    <footer className="footer footer-center w-full p-4 bg-base-100 text-base-content border-t border-base-200">
      <div className="flex flex-col md:flex-row flex-wrap gap-2 font-mono text-sm opacity-60">
        <span>issues.cash · {network}</span>
        <span className="hidden md:block">·</span>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        <span className="hidden md:block">·</span>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <span className="hidden md:block">·</span>
        <Link
          href="https://github.com/dlbn.co/issues.cash"
          className="hover:underline"
        >
          GitHub
        </Link>
      </div>
    </footer>
  );
}
