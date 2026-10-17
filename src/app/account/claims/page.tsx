import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AccountClaimsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/post");
  const claims = await prisma.claim.findMany({
    where: { claimantId: user.id },
    include: { bounty: { include: { webBounty: true } }, revisions: { orderBy: { revision: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold">Your claims</h1>
        <div className="mt-7 divide-y rounded-xl border border-base-300 bg-base-100">
          {claims.map((claim) => claim.bounty.webBounty && <Link key={claim.id} href={`/bounties/${claim.bounty.webBounty.slug}`} className="flex items-center justify-between gap-4 p-4 hover:bg-base-200">
            <div><p className="font-medium">{claim.bounty.webBounty.title}</p><p className="mt-1 text-sm text-base-content/60">Revision {claim.currentRevision}</p></div>
            <span className="font-mono text-xs">{claim.status.toLowerCase()}</span>
          </Link>)}
          {!claims.length && <p className="p-6 text-center text-base-content/55">You have not submitted a claim yet.</p>}
        </div>
      </main>
      <Footer />
    </div>
  );
}
