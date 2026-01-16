import Link from "next/link";

export function Header() {
  return (
    <header className="navbar bg-base-100 border-b border-base-200 px-4">
      <div className="flex-1">
        <Link href="/" className="text-xl font-bold font-mono">
          issues.cash
        </Link>
      </div>
    </header>
  );
}
