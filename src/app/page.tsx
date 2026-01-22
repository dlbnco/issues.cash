import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BountyList } from "@/components/BountyList";
import { OrganizationList } from "@/components/OrganizationList";
import { ContributorList } from "@/components/ContributorList";
import { Stats } from "@/components/Stats";
import {
  getAllBounties,
  getActiveBountiesTotal,
  getTopOrganizations,
  getTopContributors,
  getGlobalStats,
} from "@/lib/queries";
import { formatBCH } from "@/lib/format";

export const revalidate = 60;

export default async function HomePage() {
  const [bounties, totalAmount, organizations, contributors, globalStats] =
    await Promise.all([
      getAllBounties({ status: ["ACTIVE"] }),
      getActiveBountiesTotal(),
      getTopOrganizations(10),
      getTopContributors(10),
      getGlobalStats(),
    ]);

  const totalBCH = formatBCH(totalAmount);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Bounties</h1>
          <p className="text-base-content/60 text-sm mt-1 font-mono">
            {bounties.length} active bounties •{" "}
            <span className="text-success">
              {parseFloat(totalBCH)} BCH funded
            </span>
          </p>
        </div>
        <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden mb-8">
          <BountyList bounties={bounties} />
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold">Organizations</h2>
          <p className="text-base-content/60 text-sm mt-1 font-mono">
            Top projects by amount funded
          </p>
        </div>
        <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden mb-8">
          <OrganizationList organizations={organizations} />
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold">Contributors</h2>
          <p className="text-base-content/60 text-sm mt-1 font-mono">
            Top contributors by bounties claimed
          </p>
        </div>
        <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden mb-8">
          <ContributorList contributors={contributors} />
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold">Stats</h2>
          <p className="text-base-content/60 text-sm mt-1 font-mono">
            Platform activity
          </p>
        </div>
        <Stats {...globalStats} />
      </main>
      <Footer />
    </div>
  );
}
