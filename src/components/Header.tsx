import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="navbar bg-base-100 border-b border-base-200 px-4">
      <div className="flex-1">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold font-mono"
        >
          <Image
            width={32}
            height={32}
            src="/logo.svg"
            alt="issues.cash logo"
          />
        </Link>
      </div>
    </header>
  );
}
