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
      <Header />
      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-16 px-4 pb-16 pt-8 lg:flex-row sm:px-6 xl:px-8">
        <main className="min-w-0 flex-1">{children}</main>
        <OutstandingSidebar />
      </div>
    </ProjectsProvider>
  );
}
