import type { BountyListItem } from "@/lib/queries";
import { formatBCH } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

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
        const formattedAmount = formatBCH(bounty.fundedAmount ?? bounty.amount, { symbol: true });
        const isWebBounty = bounty.webSlug != null;
        const href = isWebBounty ? `/bounties/${bounty.webSlug}` : bounty.issueUrl;
        const title = bounty.webTitle ?? bounty.issueTitle ?? (bounty.issueNumber ? `Issue #${bounty.issueNumber}` : "Untitled bounty");

        return (
          <a
            key={bounty.id}
            href={href ?? "#"}
            target={isWebBounty ? undefined : "_blank"}
            rel={isWebBounty ? undefined : "noopener noreferrer"}
            className={`grid ${showRepo ? "grid-cols-[auto_auto_auto_1fr_auto]" : "grid-cols-[auto_auto_1fr_auto]"} gap-3 items-center py-3 px-4 font-mono text-sm hover:bg-base-200 transition-colors`}
          >
            {isWebBounty ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-content">$</span> : <img src={`https://github.com/${bounty.repoOwner}.png?size=48`} alt={bounty.repoOwner ?? "Repository"} className="rounded-full w-6 h-6" />}
            {showRepo && (
              <div className="text-base-content/70 whitespace-nowrap">
                {isWebBounty ? "community" : bounty.repoOwner}
              </div>
            )}
            <div className="text-base-content/50 whitespace-nowrap">
              {isWebBounty ? "web" : `#${bounty.issueNumber}`}
            </div>
            <div className="truncate">
              {title}
            </div>
            <div className="whitespace-nowrap text-right">
              <div className="text-success">{formattedAmount}</div>
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
