import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PostBountyForm } from "@/components/PostBountyForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Post a bounty - issues.cash",
  description: "Fund a Bitcoin Cash bounty without connecting a repository.",
};

export default async function PostBountyPage() {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold">Post a bounty</h1>
        <p className="mt-2 text-base-content/65">Fund work directly with a Bitcoin Cash escrow. Your bounty is public once funding is confirmed.</p>
        <div className="mt-8 rounded-xl border border-base-300 bg-base-100 p-5 sm:p-7">
          <PostBountyForm authenticated={user != null} telegramBotUsername={process.env.TELEGRAM_BOT_USERNAME} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
