import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ClaimForm } from "@/components/ClaimForm";
import { AwardForm } from "@/components/AwardForm";
import { RefundButton } from "@/components/RefundButton";
import { RichTextDisplay } from "@/components/RichTextDisplay";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser } from "@/lib/auth";
import { formatBCH } from "@/lib/format";
import { getWebBountyBySlug } from "@/lib/web-bounty";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function claimantName(claimant: { username: string | null; firstName: string; telegramId: bigint }) {
  if (claimant.username) return `@${claimant.username}`;
  return `${claimant.firstName} #${claimant.telegramId.toString().slice(-6)}`;
}

export default async function WebBountyPage({ params }: PageProps) {
  const { slug } = await params;
  const [bounty, user] = await Promise.all([getWebBountyBySlug(slug), getCurrentUser()]);
  if (!bounty?.webBounty) notFound();
  const isCreator = user?.id === bounty.webBounty.creatorId;
  if ((bounty.status === "PENDING_FUNDING" || bounty.webBounty.cancelledAt) && !isCreator) notFound();
  const total = bounty.amount + (bounty.feeAmount ?? BigInt(0));
  const isActive = bounty.status === "ACTIVE" && !bounty.webBounty.cancelledAt;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-base-content/55">COMMUNITY BOUNTY</p>
            <h1 className="mt-1 text-3xl font-bold">{bounty.webBounty.title}</h1>
          </div>
          <StatusBadge status={bounty.status} />
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_220px]">
          <article className="rounded-xl border border-base-300 bg-base-100 p-5 sm:p-7">
            <RichTextDisplay value={bounty.webBounty.body} />
            <p className="mt-8 text-xs text-base-content/55">Terms revision {bounty.webBounty.revision}. Previous revisions remain visible to claimants.</p>
            {bounty.webBounty.revisions.length > 1 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm">Terms history</summary>
                {bounty.webBounty.revisions.map((revision) => (
                  <section key={revision.id} className="mt-4 border-t border-base-300 pt-4">
                    <p className="text-xs text-base-content/55">Revision {revision.revision} · {revision.createdAt.toISOString()}</p>
                    <h3 className="my-2 font-semibold">{revision.title}</h3>
                    <RichTextDisplay value={revision.body} />
                  </section>
                ))}
              </details>
            )}
          </article>
          <aside className="space-y-4 rounded-xl border border-base-300 bg-base-100 p-5 text-sm">
            <div><p className="text-base-content/55">Reward</p><p className="mt-1 text-lg font-semibold text-success">{formatBCH(bounty.amount, { symbol: true })}</p></div>
            <div><p className="text-base-content/55">Expires</p><p className="mt-1">{new Date(bounty.locktime * 1000).toLocaleString()}</p></div>
            {bounty.webBounty.cancelledAt && <p className="text-warning">Cancelled. Do not fund this escrow. Any recoverable deposits will be refunded automatically.</p>}
            {bounty.status === "PENDING_FUNDING" && isCreator && !bounty.webBounty.cancelledAt && <>
              <div><p className="text-base-content/55">Fund this escrow</p><p className="mt-1 break-all font-mono text-xs">{bounty.contractAddress}</p></div>
              <div><p className="text-base-content/55">Send exactly</p><p className="mt-1 font-semibold">{formatBCH(total, { symbol: true })}</p></div>
              <p className="text-xs text-warning">This bounty becomes public after its escrow confirms.</p>
            </>}
            {isActive && isCreator && <RefundButton bountyId={bounty.id} />}
          </aside>
        </div>
        {isActive && isCreator && bounty.claims.some((c) => c.status === "PENDING") && (
          <section className="mt-8 rounded-xl border border-base-300 bg-base-100 p-5 sm:p-7">
            <h2 className="text-xl font-bold">Award bounty</h2>
            <p className="mt-1 text-sm text-base-content/65">Select a claimant and confirm the payout. This action is irreversible.</p>
            <div className="mt-5">
              <AwardForm
                bountyId={bounty.id}
                claims={bounty.claims.map((c) => ({
                  id: c.id,
                  status: c.status,
                  claimant: { firstName: c.claimant.firstName, username: c.claimant.username, telegramId: c.claimant.telegramId },
                  revisions: c.revisions.map((r) => ({ revision: r.revision, payoutAddress: r.payoutAddress, body: r.body, workUrl: r.workUrl })),
                }))}
              />
            </div>
          </section>
        )}
        {isActive && !isCreator && (
          <section className="mt-8 rounded-xl border border-base-300 bg-base-100 p-5 sm:p-7">
            <h2 className="text-xl font-bold">Claim this bounty</h2>
            <p className="mt-1 text-sm text-base-content/65">The creator manually awards one claim. Escrow is trustless, but delivery approval is decided by the creator.</p>
            <div className="mt-5"><ClaimForm bountyId={bounty.id} authenticated={user != null} telegramBotUsername={process.env.TELEGRAM_BOT_USERNAME} /></div>
          </section>
        )}
        <section className="mt-8">
          <h2 className="text-xl font-bold">Claims ({bounty.claims.length})</h2>
          <div className="mt-4 space-y-3">
            {bounty.claims.map((claim) => {
              const revision = claim.revisions[0];
              return <article key={claim.id} className="rounded-lg border border-base-300 bg-base-100 p-4">
                <div className="flex items-center justify-between gap-3"><strong>{claimantName(claim.claimant)}</strong><span className="font-mono text-xs text-base-content/55">{claim.status.toLowerCase()}</span></div>
                {revision && <><p className="mt-3 whitespace-pre-wrap text-sm">{revision.body}</p>{revision.workUrl && <a className="mt-3 inline-block text-sm link link-primary" href={revision.workUrl} target="_blank" rel="noreferrer">View work</a>}</>}
                {claim.revisions.length > 1 && <details className="mt-3 text-sm"><summary className="cursor-pointer">Claim history</summary>{claim.revisions.slice(1).map((previous) => <div key={previous.id} className="mt-3 border-t border-base-300 pt-3"><p className="text-xs text-base-content/55">Revision {previous.revision} · {previous.createdAt.toISOString()}</p><p className="mt-2 whitespace-pre-wrap">{previous.body}</p>{previous.workUrl && <a href={previous.workUrl} className="link link-primary" target="_blank" rel="noreferrer">View work</a>}</div>)}</details>}
              </article>;
            })}
            {!bounty.claims.length && <p className="text-sm text-base-content/55">No claims yet.</p>}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
