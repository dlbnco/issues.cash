import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getAttemptsByContributor, getContributorStats } from "@/lib/queries";
import { formatBCH } from "@/lib/format";
import { getWebsiteNetwork } from "@/lib/network-filter";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export const revalidate = 60;

interface ContributorPageProps {
  params: Promise<{
    login: string;
  }>;
}

export async function generateMetadata({ params }: ContributorPageProps) {
  const { login } = await params;
  return {
    title: `@${login} - issues.cash`,
    description: `Bounty attempts by @${login} on issues.cash`,
  };
}

export default async function ContributorPage({
  params,
}: ContributorPageProps) {
  const { login } = await params;
  const network = getWebsiteNetwork();

  const [attempts, stats] = await Promise.all([
    getAttemptsByContributor(login, network),
    getContributorStats(login, network),
  ]);

  if (attempts.length === 0) {
    notFound();
  }

  const githubUrl = `https://github.com/${login}`;
  const avatarUrl = `https://github.com/${login}.png`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Image
              src={avatarUrl}
              alt={login}
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
                @{login}
              </a>
            </h1>
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-base-content/60 font-mono">
            <span>{stats.totalAttempts} attempts</span>
            <span className="text-success">
              {stats.approvedAttempts} approved
            </span>
            <span>{stats.pendingAttempts} pending</span>
            <span className="text-success">
              {formatBCH(stats.totalEarned, { symbol: true })} earned
            </span>
          </div>
        </div>
        <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden">
          <div className="divide-y divide-base-200">
            {attempts.map((attempt) => {
              return (
                <div
                  key={attempt.id}
                  className="flex items-center gap-3 py-3 px-4 hover:bg-base-200 font-mono text-sm transition-colors"
                >
                  <Link
                    href={`/orgs/${attempt.bounty.repoOwner}/${attempt.bounty.repoName}`}
                    className="text-base-content/70 hover:text-primary shrink-0"
                  >
                    {attempt.bounty.repoOwner}/{attempt.bounty.repoName}
                  </Link>
                  <a
                    href={attempt.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary"
                  >
                    PR #{attempt.prNumber}
                  </a>
                  <span className="text-base-content/50">
                    for #{attempt.bounty.issueNumber}
                  </span>
                  <span className="text-success">
                    {formatBCH(
                      attempt.bounty.fundedAmount ?? attempt.bounty.amount,
                      { symbol: true },
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-base-content/60 text-xs ml-auto">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        attempt.status === "APPROVED"
                          ? "bg-success"
                          : attempt.status === "PENDING"
                            ? "bg-warning"
                            : "bg-base-300"
                      }`}
                    />
                    {attempt.status.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
