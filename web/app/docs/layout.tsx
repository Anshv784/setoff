import type { Metadata } from "next";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { DocsSidebar, PageNav } from "@/components/docs/ui";
import { DocsSearchProvider, OnThisPage, SearchButton } from "@/components/docs/search";

export const metadata: Metadata = { title: { default: "Docs", template: "%s · Setoff docs" } };

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocsSearchProvider>
      <SiteNav />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)] md:px-6 xl:grid-cols-[200px_minmax(0,1fr)_176px]">
        <aside className="flex flex-col gap-6 md:sticky md:top-24 md:h-[calc(100svh-7rem)] md:overflow-y-auto">
          <SearchButton />
          <details className="group rounded-xl border border-border p-3 md:hidden">
            <summary className="cursor-pointer list-none text-sm font-medium">Documentation menu</summary>
            <div className="pt-4">
              <DocsSidebar />
            </div>
          </details>
          <div className="hidden md:block">
            <DocsSidebar />
          </div>
        </aside>
        <article className="min-w-0 pb-10">
          {children}
          <PageNav />
        </article>
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <OnThisPage />
          </div>
        </aside>
      </div>
      <SiteFooter />
    </DocsSearchProvider>
  );
}
