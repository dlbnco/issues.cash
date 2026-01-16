import type { BountyStatus } from "@prisma/client";

interface StatusBadgeProps {
  status: BountyStatus;
}

const statusConfig: Record<
  BountyStatus,
  { label: string; colorClass: string }
> = {
  PENDING_FUNDING: { label: "pending", colorClass: "bg-warning" },
  ACTIVE: { label: "active", colorClass: "bg-success" },
  CLAIMED: { label: "claimed", colorClass: "bg-info" },
  EXPIRED: { label: "expired", colorClass: "bg-base-300" },
  REFUNDED: { label: "refunded", colorClass: "bg-base-300" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className="flex items-center gap-1.5 text-base-content/60 text-xs">
      <span className={`w-2 h-2 rounded-full shrink-0 ${config.colorClass}`} />
      {config.label}
    </span>
  );
}
