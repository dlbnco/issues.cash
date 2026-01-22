import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BountyList } from "@/components/BountyList";
import { getBountiesByRepo, getProjectStats } from "@/lib/queries";
import { formatBCH } from "@/lib/format";
import { notFound } from "next/navigation";
import Image from "next/image";

export const revalidate = 60;

interface ProjectPageProps {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

export async function generateMetadata({ params }: ProjectPageProps) {
  const { owner, repo } = await params;
  return {
    title: `${owner}/${repo} - issues.cash`,
    description: `Bounties for ${owner}/${repo} on issues.cash`,
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { owner, repo } = await params;
  const [bounties, stats] = await Promise.all([
    getBountiesByRepo(owner, repo),
    getProjectStats(owner, repo),
  ]);

  if (bounties.length === 0) {
    notFound();
  }

  const githubUrl = `https://github.com/${owner}/${repo}`;
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
                {owner}/{repo}
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
        <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden">
          <BountyList bounties={bounties} showRepo={false} showStatus={true} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
