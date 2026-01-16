import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BountyList } from "@/components/BountyList";
import { getAllBounties } from "@/lib/queries";

export const revalidate = 60;

export default async function HomePage() {
  const bounties = await getAllBounties({ status: ["ACTIVE"] });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Bounties</h1>
          <p className="text-base-content/60 text-sm mt-1">
            {bounties.length} active bounties across all projects
          </p>
        </div>
        <div className="bg-base-100 border border-base-200 rounded-lg overflow-hidden">
          <BountyList bounties={bounties} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
