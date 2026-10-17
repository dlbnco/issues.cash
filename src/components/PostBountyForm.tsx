"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";

interface PostBountyFormProps {
  authenticated: boolean;
  telegramBotUsername?: string;
}

export function PostBountyForm({ authenticated: initialAuthenticated, telegramBotUsername }: PostBountyFormProps) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [title, setTitle] = useState("");
  const [amountBCH, setAmountBCH] = useState("");
  const [refundAddress, setRefundAddress] = useState("");
  const [expiryDays, setExpiryDays] = useState("90");
  const [body, setBody] = useState<object>({ root: { children: [], type: "root", version: 1 } });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authenticated) {
      setError("Sign in with Telegram before creating the escrow.");
      return;
    }
    setSaving(true);
    setError(undefined);
    const response = await fetch("/api/web-bounties", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, amountBCH, refundAddress, expiryDays }),
    });
    const result = await response.json();
    if (!response.ok) {
      setSaving(false);
      setError(result.error ?? "Unable to create bounty");
      return;
    }
    router.push(`/bounties/${result.slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <label className="form-control">
        <span className="label-text mb-2 font-medium">Title</span>
        <input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="input input-bordered" placeholder="What needs to be done?" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-control">
          <span className="label-text mb-2 font-medium">Bounty amount (BCH)</span>
          <input required type="number" min="0" step="0.00000001" value={amountBCH} onChange={(event) => setAmountBCH(event.target.value)} className="input input-bordered" placeholder="0.1" />
        </label>
        <label className="form-control">
          <span className="label-text mb-2 font-medium">Expiry (days)</span>
          <input required type="number" min="1" max="365" value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)} className="input input-bordered" />
        </label>
      </div>
      <label className="form-control">
        <span className="label-text mb-2 font-medium">Refund address</span>
        <input required value={refundAddress} onChange={(event) => setRefundAddress(event.target.value)} className="input input-bordered font-mono text-sm" placeholder="bitcoincash:qp..." />
        <span className="label-text-alt mt-2 text-base-content/60">This address is fixed when the escrow is created.</span>
      </label>
      <div>
        <p className="mb-2 font-medium">Bounty details</p>
        <RichTextEditor onChange={setBody} />
      </div>
      {!authenticated && (
        <div className="rounded-lg border border-base-300 p-4">
          <p className="mb-3 text-sm">Sign in with Telegram to create and later manage this bounty.</p>
          <TelegramLoginButton botUsername={telegramBotUsername} onAuthenticated={() => setAuthenticated(true)} />
        </div>
      )}
      {authenticated && <p className="text-sm text-success">Telegram account connected.</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      <button disabled={saving} className="btn btn-primary w-full sm:w-auto" type="submit">
        {saving ? "Creating escrow..." : "Create escrow"}
      </button>
    </form>
  );
}
