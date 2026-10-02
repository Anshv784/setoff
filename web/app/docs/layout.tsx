import type { Metadata } from "next";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { DocsSidebar, PageNav } from "@/components/docs/ui";

export const metadata: Metadata = { title: { default: "Docs", template: "%s · Setoff docs" } };

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)] md:px-6">
        <aside className="md:sticky md:top-24 md:h-[calc(100svh-7rem)] md:overflow-y-auto">
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
      </div>
      <SiteFooter />
    </>
  );
}
