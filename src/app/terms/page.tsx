import { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";
import TermsContent from "@/content/terms.mdx";

export const metadata: Metadata = {
  title: "Terms of Service | issues.cash",
  description:
    "Terms of Service for issues.cash - Trustless bounties on Bitcoin Cash",
};

export default function TermsPage() {
  return (
    <ContentPage title="Terms of Service" lastUpdated="January 30, 2026">
      <TermsContent />
    </ContentPage>
  );
}
