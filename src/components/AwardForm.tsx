"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AwardFormProps {
  bountyId: string;
  claims: Array<{
    id: string;
    status: string;
    claimant: { firstName: string; username: string | null; telegramId: bigint };
    revisions: Array<{ revision: number; payoutAddress: string; body: string; workUrl: string | null }>;
  }>;
}

export function AwardForm({ bountyId, claims }: AwardFormProps) {
  const router = useRouter();
  const pendingClaims = claims.filter((claim) => claim.status === "PENDING");
  const [selectedClaimId, setSelectedClaimId] = useState<string>(pendingClaims[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const selectedClaim = claims.find((c) => c.id === selectedClaimId);
  const currentRevision = selectedClaim?.revisions[0];

  async function handleAward() {
    if (!selectedClaimId || !currentRevision) return;
    setSaving(true);
    setError(undefined);
    const response = await fetch(`/api/web-bounties/${bountyId}/award`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimId: selectedClaimId, revision: currentRevision.revision }),
    });
    const result = await response.json();
    if (!response.ok) {
      setSaving(false);
      setError(result.error ?? "Unable to award bounty");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="form-control">
        <span className="label-text mb-2 font-medium">Select claim to award</span>
        <select
          value={selectedClaimId}
          onChange={(event) => setSelectedClaimId(event.target.value)}
          className="select select-bordered"
        >
          {pendingClaims.map((claim) => {
            const name = claim.claimant.username
              ? `@${claim.claimant.username}`
              : `${claim.claimant.firstName} #${claim.claimant.telegramId.toString().slice(-6)}`;
            return (
              <option key={claim.id} value={claim.id}>
                {name}
              </option>
            );
          })}
        </select>
      </label>

      {currentRevision && (
        <div className="rounded-lg bg-base-200 p-4 text-sm">
          <p className="text-base-content/65 mb-1">Recipient address:</p>
          <p className="break-all font-mono text-xs">{currentRevision.payoutAddress}</p>
          {currentRevision.workUrl && (
            <a
              href={currentRevision.workUrl}
              target="_blank"
              rel="noreferrer"
              className="link link-primary mt-2 inline-block"
            >
              View submitted work
            </a>
          )}
        </div>
      )}

      <p className="text-xs text-base-content/55">
        This action is irreversible. The escrow will be paid to the selected recipient.
      </p>

      {error && <p className="text-sm text-error">{error}</p>}

      <button
        disabled={saving || !selectedClaimId}
        className="btn btn-primary"
        onClick={handleAward}
      >
        {saving ? "Paying..." : "Confirm award"}
      </button>
    </div>
  );
}
