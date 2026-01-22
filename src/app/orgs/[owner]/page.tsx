import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BountyList } from "@/components/BountyList";
import { getBountiesByOwner, getOwnerStats, getReposByOwner } from "@/lib/queries";
import { formatBCH } from "@/lib/format";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 60;

interface OrgPageProps {
  params: Promise<{
    owner: string;
  }>;
}

export async function generateMetadata({ params }: OrgPageProps) {
  const { owner } = await params;
  return {
    title: `${owner} - issues.cash`,
    description: `Bounties for ${owner} on issues.cash`,
  };
}

export default async function OrgPage({ params }: OrgPageProps) {
  const { owner } = await params;
  const [bounties, stats, repos] = await Promise.all([
    getBountiesByOwner(owner),
    getOwnerStats(owner),
    getReposByOwner(owner),
  ]);

  if (bounties.length === 0) {
    notFound();
  }

  const githubUrl = `https://github.com/${owner}`;
  const avatarUrl = `https://github.com/${owner}.png`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Image
              src={avatarUrl}
              alt={owner}
              width={48}
              height={48}
              className="rounded-full"
            />
            <h1 className="text-2xl font-bold">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
              >
                {owner}
              </a>
            </h1>
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-base-content/60 font-mono">
            <span>{stats.totalBounties} bounties</span>
            <span>{stats.activeBounties} active</span>
            <span>{stats.claimedBounties} claimed</span>
            <span className="text-success">
              {parseFloat(formatBCH(stats.totalFunded))} BCH funded
            </span>
          </div>
        </div>

        {repos.length > 1 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Repositories</h2>
            <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden">
              <div className="divide-y divide-base-200">
                {repos.map((repo) => (
                  <Link
                    key={repo.name}
                    href={`/orgs/${owner}/${repo.name}`}
                    className="flex items-center justify-between py-3 px-4 font-mono text-sm hover:bg-base-200 transition-colors"
                  >
                    <span>{repo.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-base-content/60">
                        {repo.bountiesCount} {repo.bountiesCount === 1 ? "bounty" : "bounties"}
                      </span>
                      <span className="text-success font-semibold">
                        {parseFloat(formatBCH(repo.totalFunded))} BCH
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-3">All Bounties</h2>
          <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden">
            <BountyList bounties={bounties} showRepo={repos.length > 1} showStatus={true} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
