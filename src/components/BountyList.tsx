import type { BountyListItem } from "@/lib/queries";
import { formatBCH } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import Link from "next/link";
import Image from "next/image";

interface BountyListProps {
  bounties: BountyListItem[];
  showRepo?: boolean;
  showStatus?: boolean;
  emptyMessage?: string;
}

export function BountyList({
  bounties,
  showRepo = true,
  showStatus = false,
  emptyMessage = "No bounties found",
}: BountyListProps) {
  if (bounties.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/50 font-mono">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="divide-y divide-base-200">
      {bounties.map((bounty) => {
        const displayAmount = formatBCH(bounty.fundedAmount ?? bounty.amount);
        const formattedAmount = parseFloat(displayAmount).toString();

        const avatarUrl = `https://github.com/${bounty.repoOwner}.png?size=48`;

        return (
          <a
            key={bounty.id}
            href={bounty.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`grid ${showRepo ? "grid-cols-[auto_auto_auto_1fr_auto]" : "grid-cols-[auto_auto_1fr_auto]"} gap-3 items-center py-3 px-4 font-mono text-sm hover:bg-base-200 transition-colors`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt={bounty.repoOwner} className="rounded-full w-6 h-6" />
            {showRepo && (
              <div className="text-base-content/70 whitespace-nowrap">
                {bounty.repoOwner}
              </div>
            )}
            <div className="text-base-content/50 whitespace-nowrap">
              #{bounty.issueNumber}
            </div>
            <div className="truncate">
              {bounty.issueTitle ?? `Issue #${bounty.issueNumber}`}
            </div>
            <div className="whitespace-nowrap text-right">
              <div className="text-success font-semibold">
                {formattedAmount} BCH
              </div>
              {showStatus && (
                <div className="mt-1 flex justify-end">
                  <StatusBadge status={bounty.status} />
                </div>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
