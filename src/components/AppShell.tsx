"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ProjectsProvider } from "@/lib/store";
import Header from "@/components/Header";
import OutstandingSidebar from "@/components/OutstandingSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Board must stay viewport-locked; other pages scroll inside main.
  const lockBoard = pathname === "/";
  const outerScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // Custom scroll containers keep scrollTop across client navigations —
  // reset so project (and other) pages always open at the top.
  useEffect(() => {
    outerScrollRef.current?.scrollTo(0, 0);
    mainScrollRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <ProjectsProvider>
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden">
        <Header />
        <div
          ref={outerScrollRef}
          className={`mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 xl:px-8 ${
            lockBoard
              ? "overflow-hidden"
              : "overflow-y-auto lg:overflow-hidden"
          }`}
        >
          <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div
              ref={mainScrollRef}
              className={
                lockBoard
                  ? "absolute inset-0 min-h-0 overflow-hidden"
                  : "min-h-0 lg:absolute lg:inset-0 lg:overflow-y-auto lg:overscroll-contain"
              }
            >
              {children}
            </div>
          </main>
          <OutstandingSidebar />
        </div>
      </div>
    </ProjectsProvider>
  );
}
