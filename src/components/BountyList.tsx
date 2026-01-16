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
    <table className="w-full">
      <tbody className="divide-y divide-base-200">
        {bounties.map((bounty) => {
          const [owner, repo] = bounty.repoFullName.split("/");
          const displayAmount = formatBCH(bounty.fundedAmount ?? bounty.amount);
          const formattedAmount = parseFloat(displayAmount).toString();

          const avatarUrl = `https://github.com/${owner}.png?size=48`;

          return (
            <tr
              key={bounty.id}
              className="hover:bg-base-200 font-mono text-sm transition-colors"
            >
              <td className="py-3 pl-4 pr-2">
                <Link
                  href={`/projects/${owner}/${repo}`}
                  className="block w-6 h-6 shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl}
                    alt={owner}
                    className="rounded-full w-6 h-6"
                  />
                </Link>
              </td>
              {showRepo && (
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Link
                    href={`/projects/${owner}/${repo}`}
                    className="text-base-content/70 hover:text-primary"
                  >
                    {bounty.repoFullName}
                  </Link>
                </td>
              )}
              <td className="py-3 pr-3 whitespace-nowrap">
                <a
                  href={bounty.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base-content/50 hover:text-primary"
                >
                  #{bounty.issueNumber}
                </a>
              </td>
              <td className="py-3 pr-3 max-w-0 w-full">
                <a
                  href={bounty.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate hover:text-primary"
                >
                  {bounty.issueTitle ?? `Issue #${bounty.issueNumber}`}
                </a>
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-right">
                <div className="text-success font-semibold">
                  {formattedAmount} BCH
                </div>
                {showStatus && (
                  <div className="mt-1 flex justify-end">
                    <StatusBadge status={bounty.status} />
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
