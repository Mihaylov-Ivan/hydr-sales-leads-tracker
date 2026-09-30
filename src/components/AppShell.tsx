"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ProjectsProvider } from "@/lib/store";
import { ProspectingProvider } from "@/lib/prospecting-store";
import Header from "@/components/Header";
import OutstandingSidebar from "@/components/OutstandingSidebar";
import { ProspectSalesSync } from "@/components/prospecting/ProspectSalesSync";
import { getScrollPos, setScrollPos } from "@/lib/scroll-restore";

function shellScrollKey(pathname: string, part: "outer" | "main" | "window") {
  return `shell:${part}:${pathname}`;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isViewer } = useAuth();
  // Board and personal to-dos stay viewport-locked; other pages scroll inside main.
  const lockBoard = pathname === "/" || pathname === "/todos";
  const outerScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(pathname);

  // Save the leaving page's scroll, then restore the destination page's.
  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev && prev !== pathname) {
      setScrollPos(shellScrollKey(prev, "outer"), {
        top: outerScrollRef.current?.scrollTop ?? 0,
      });
      setScrollPos(shellScrollKey(prev, "main"), {
        top: mainScrollRef.current?.scrollTop ?? 0,
      });
      setScrollPos(shellScrollKey(prev, "window"), {
        top: window.scrollY || document.documentElement.scrollTop || 0,
      });
    }
    prevPathRef.current = pathname;

    const outer = getScrollPos(shellScrollKey(pathname, "outer")).top;
    const main = getScrollPos(shellScrollKey(pathname, "main")).top;
    const win = getScrollPos(shellScrollKey(pathname, "window")).top;

    const restore = () => {
      outerScrollRef.current?.scrollTo(0, outer);
      mainScrollRef.current?.scrollTo(0, main);
      window.scrollTo(0, win);
    };
    restore();
    const raf = requestAnimationFrame(restore);
    const t = window.setTimeout(restore, 50);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [pathname]);

  // Keep shell scroll positions fresh while the user scrolls (survives refresh).
  useEffect(() => {
    const outer = outerScrollRef.current;
    const main = mainScrollRef.current;
    let raf = 0;
    const persist = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const path = prevPathRef.current;
        if (outer) {
          setScrollPos(shellScrollKey(path, "outer"), { top: outer.scrollTop });
        }
        if (main) {
          setScrollPos(shellScrollKey(path, "main"), { top: main.scrollTop });
        }
        setScrollPos(shellScrollKey(path, "window"), {
          top: window.scrollY || document.documentElement.scrollTop || 0,
        });
      });
    };
    outer?.addEventListener("scroll", persist, { passive: true });
    main?.addEventListener("scroll", persist, { passive: true });
    window.addEventListener("scroll", persist, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      outer?.removeEventListener("scroll", persist);
      main?.removeEventListener("scroll", persist);
      window.removeEventListener("scroll", persist);
    };
  }, []);

  return (
    <ProjectsProvider>
      <ProspectingProvider>
        <ProspectSalesSync />
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
                    : "min-h-0 lg:absolute lg:inset-0 lg:overflow-y-auto lg:p-4 xl:p-6"
                }
              >
                {children}
              </div>
            </main>
            {!isViewer && <OutstandingSidebar />}
          </div>
        </div>
      </ProspectingProvider>
    </ProjectsProvider>
  );
}
