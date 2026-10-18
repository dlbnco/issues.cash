import { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";
import PrivacyContent from "@/content/privacy.mdx";

export const metadata: Metadata = {
  title: "Privacy Policy | issues.cash",
  description:
    "Privacy Policy for issues.cash - Trustless bounties on Bitcoin Cash",
};

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy Policy" lastUpdated="January 30, 2026">
      <PrivacyContent />
    </ContentPage>
  );
}
