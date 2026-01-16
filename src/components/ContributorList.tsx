import { formatBCH } from "@/lib/format";
import Link from "next/link";

interface Contributor {
  login: string;
  claimedCount: number;
  totalEarned: bigint;
}

interface ContributorListProps {
  contributors: Contributor[];
  emptyMessage?: string;
}

export function ContributorList({
  contributors,
  emptyMessage = "No contributors found",
}: ContributorListProps) {
  if (contributors.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/50 font-mono">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="divide-y divide-base-200">
      {contributors.map((contributor) => {
        const displayAmount = formatBCH(contributor.totalEarned);
        const formattedAmount = parseFloat(displayAmount).toString();
        const avatarUrl = `https://github.com/${contributor.login}.png?size=48`;

        return (
          <Link
            key={contributor.login}
            href={`/contributors/${contributor.login}`}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center py-3 px-4 font-mono text-sm hover:bg-base-200 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt={contributor.login}
              className="rounded-full w-6 h-6"
            />
            <div className="truncate">{contributor.login}</div>
            <div className="text-base-content/60 whitespace-nowrap">
              {contributor.claimedCount}{" "}
              {contributor.claimedCount === 1 ? "bounty" : "bounties"} claimed
            </div>
            <div className="text-success font-semibold whitespace-nowrap text-right">
              {formattedAmount} BCH
            </div>
          </Link>
        );
      })}
    </div>
  );
}
