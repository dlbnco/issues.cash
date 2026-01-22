import { formatBCH } from "@/lib/format";

interface StatsProps {
  activeBCH: bigint;
  pendingBCH: bigint;
  paidBCH: bigint;
  totalClaims: number;
  totalContributors: number;
  totalOrganizations: number;
}

interface StatCardProps {
  value: string;
  label: string;
  variant?: "default" | "success" | "warning";
}

function StatCard({ value, label, variant = "default" }: StatCardProps) {
  const valueColor = {
    default: "text-base-content",
    success: "text-success",
    warning: "text-warning",
  }[variant];

  return (
    <div className="bg-base-100 border border-base-200 rounded-lg p-4 text-center">
      <div className={`text-2xl font-mono ${valueColor}`}>{value}</div>
      <div className="text-sm text-base-content/60 mt-1">{label}</div>
    </div>
  );
}

export function Stats({
  activeBCH,
  pendingBCH,
  paidBCH,
  totalClaims,
  totalContributors,
  totalOrganizations,
}: StatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard
        value={formatBCH(activeBCH, { symbol: true })}
        label="Active"
        variant="success"
      />
      <StatCard
        value={formatBCH(pendingBCH, { symbol: true })}
        label="Pending"
        variant="warning"
      />
      <StatCard
        value={formatBCH(paidBCH, { symbol: true })}
        label="Paid Out"
        variant="success"
      />
      <StatCard value={totalClaims.toString()} label="Claims" />
      <StatCard value={totalContributors.toString()} label="Contributors" />
      <StatCard value={totalOrganizations.toString()} label="Organizations" />
    </div>
  );
}
