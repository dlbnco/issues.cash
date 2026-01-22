import { formatBCH } from "@/lib/format";
import Link from "next/link";

interface Organization {
  owner: string;
  repo: string;
  totalFunded: bigint;
  bountiesCount: number;
}

interface OrganizationListProps {
  organizations: Organization[];
  emptyMessage?: string;
}

export function OrganizationList({
  organizations,
  emptyMessage = "No organizations found",
}: OrganizationListProps) {
  if (organizations.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/50 font-mono">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="divide-y divide-base-200">
      {organizations.map((org) => {
        const displayAmount = formatBCH(org.totalFunded);
        const formattedAmount = parseFloat(displayAmount).toString();
        const avatarUrl = `https://github.com/${org.owner}.png?size=48`;

        return (
          <Link
            key={`${org.owner}/${org.repo}`}
            href={`/projects/${org.owner}/${org.repo}`}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center py-3 px-4 font-mono text-sm hover:bg-base-200 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt={org.owner}
              className="rounded-full w-6 h-6"
            />
            <div className="truncate">{org.owner}</div>
            <div className="text-base-content/60 whitespace-nowrap">
              {org.bountiesCount}{" "}
              {org.bountiesCount === 1 ? "bounty" : "bounties"}
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
