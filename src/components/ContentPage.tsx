import { Header } from "./Header";
import { Footer } from "./Footer";
import { ReactNode } from "react";

interface ContentPageProps {
  children: ReactNode;
  title?: string;
  lastUpdated?: string;
}

export function ContentPage({ children, title, lastUpdated }: ContentPageProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8">
        <article>
          {title && <h1 className="text-3xl font-bold mb-2">{title}</h1>}
          {lastUpdated && (
            <p className="text-sm text-base-content/60 mb-8">
              Last updated: {lastUpdated}
            </p>
          )}
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
