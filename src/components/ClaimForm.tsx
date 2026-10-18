"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";

interface ClaimFormProps {
  bountyId: string;
  authenticated: boolean;
  telegramBotUsername?: string;
}

export function ClaimForm({ bountyId, authenticated: initialAuthenticated, telegramBotUsername }: ClaimFormProps) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [payoutAddress, setPayoutAddress] = useState("");
  const [body, setBody] = useState("");
  const [workUrl, setWorkUrl] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authenticated) {
      setError("Sign in with Telegram to submit a claim.");
      return;
    }
    setSaving(true);
    setError(undefined);
    const response = await fetch(`/api/web-bounties/${bountyId}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payoutAddress, body, workUrl }),
    });
    const result = await response.json();
    if (!response.ok) {
      setSaving(false);
      setError(result.error ?? "Unable to save claim");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="form-control">
        <span className="label-text mb-2">BCH payout address</span>
        <input required value={payoutAddress} onChange={(event) => setPayoutAddress(event.target.value)} className="input input-bordered font-mono text-sm" placeholder="bitcoincash:qp..." />
      </label>
      <label className="form-control">
        <span className="label-text mb-2">Proposal or delivery notes</span>
        <textarea required maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} className="textarea textarea-bordered min-h-32" placeholder="Explain your approach and what you will deliver." />
      </label>
      <label className="form-control">
        <span className="label-text mb-2">Work link (optional)</span>
        <input type="url" value={workUrl} onChange={(event) => setWorkUrl(event.target.value)} className="input input-bordered" placeholder="https://..." />
      </label>
      {!authenticated && <TelegramLoginButton botUsername={telegramBotUsername} onAuthenticated={() => setAuthenticated(true)} />}
      {error && <p className="text-sm text-error">{error}</p>}
      <button disabled={saving} className="btn btn-primary" type="submit">{saving ? "Saving..." : "Submit claim"}</button>
      <p className="text-xs text-base-content/60">You can revise or withdraw this claim until the creator chooses a recipient.</p>
    </form>
  );
}
