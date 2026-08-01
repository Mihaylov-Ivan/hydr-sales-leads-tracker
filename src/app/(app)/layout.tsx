import { ProjectsProvider } from "@/lib/store";
import Header from "@/components/Header";
import OutstandingSidebar from "@/components/OutstandingSidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProjectsProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <Header />
        <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 lg:flex-row lg:overflow-hidden sm:px-6 xl:px-8">
          <main className="relative min-h-0 min-w-0 flex-1 lg:overflow-hidden">
            <div className="lg:absolute lg:inset-0 lg:overflow-y-auto lg:overscroll-contain">
              {children}
            </div>
          </main>
          <OutstandingSidebar />
        </div>
      </div>
    </ProjectsProvider>
  );
}
