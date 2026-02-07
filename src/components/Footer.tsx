import Link from "next/link";
import { getWebsiteNetworkName } from "@/lib/network-filter";

export function Footer() {
  const network = getWebsiteNetworkName();

  return (
    <footer className="footer footer-center p-4 bg-base-100 text-base-content border-t border-base-200">
      <aside>
        <p className="font-mono text-sm opacity-60">
          issues.cash
          <span className="mx-2">·</span>
          <span>{network}</span>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link
            href="https://github.com/dlbn.co/issues.cash"
            className="hover:underline"
          >
            GitHub
          </Link>
        </p>
      </aside>
    </footer>
  );
}
