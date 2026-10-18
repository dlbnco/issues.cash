"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RefundButtonProps {
  bountyId: string;
}

export function RefundButton({ bountyId }: RefundButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);

  async function handleRefund() {
    setSaving(true);
    setError(undefined);
    const response = await fetch(`/api/web-bounties/${bountyId}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const result = await response.json();
    if (!response.ok) {
      setSaving(false);
      setError(result.error ?? "Unable to refund bounty");
      return;
    }
    router.refresh();
  }

  if (!confirmed) {
    return (
      <button className="btn btn-ghost btn-sm text-warning" onClick={() => setConfirmed(true)}>
        Request refund
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-warning">Confirm refund. Funds will be sent to the refund address and all pending claims will be rejected.</p>
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="btn btn-warning btn-sm" onClick={handleRefund}>
          {saving ? "Refunding..." : "Confirm refund"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmed(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
