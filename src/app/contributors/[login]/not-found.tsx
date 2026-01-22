import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Link from "next/link";

export default function ContributorNotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-base-content/60 mb-6">
            No attempts found for this contributor
          </p>
          <Link href="/" className="btn btn-primary btn-sm">
            Back to all bounties
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
