import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser } from "@/lib/auth";
import { formatBCH } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function AccountBountiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/post");
  const bounties = await prisma.bounty.findMany({
    where: { platform: "WEB", webBounty: { creatorId: user.id } },
    include: { webBounty: true, _count: { select: { claims: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold">Your bounties</h1>
        <div className="mt-7 divide-y rounded-xl border border-base-300 bg-base-100">
          {bounties.map((bounty) => bounty.webBounty && <Link key={bounty.id} href={`/bounties/${bounty.webBounty.slug}`} className="flex items-center justify-between gap-4 p-4 hover:bg-base-200">
            <div><p className="font-medium">{bounty.webBounty.title}</p><p className="mt-1 text-sm text-base-content/60">{bounty._count.claims} claims</p></div>
            <div className="text-right"><p className="text-success">{formatBCH(bounty.amount, { symbol: true })}</p><div className="mt-1"><StatusBadge status={bounty.status} /></div></div>
          </Link>)}
          {!bounties.length && <p className="p-6 text-center text-base-content/55">You have not posted a bounty yet.</p>}
        </div>
      </main>
      <Footer />
    </div>
  );
}
