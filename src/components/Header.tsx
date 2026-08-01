"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { teamMembers, currentUserId, setCurrentUserId, ready } = useProjects();
  const selectedUserId =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : (teamMembers[0]?.id ?? "");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const navLink = (href: string, label: string) => {
    const active =
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
          active
            ? "bg-teal-soft text-teal-accent"
            : "text-muted hover:bg-surface hover:text-deep"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link href="/" className="flex flex-col items-start gap-0.5">
            <Image
              src="/hydrogenera-logo.png"
              alt="Hydrogenera"
              width={110}
              height={18}
              priority
              className="h-4 w-auto sm:h-[18px]"
            />
            <span className="mt-1 text-[14px] leading-none text-muted">
              Sales Tracker
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {navLink("/", "Board")}
            {navLink("/finance", "Finance")}
          </nav>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <label className="flex min-w-0 items-center gap-2">
            <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-muted sm:inline">
              Working as
            </span>
            <select
              value={selectedUserId}
              disabled={!ready || teamMembers.length === 0}
              onChange={(e) => setCurrentUserId(e.target.value)}
              aria-label="Select current user"
              className="max-w-[12rem] rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-deep shadow-sm outline-none transition hover:border-teal-accent/40 focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[16rem]"
            >
              {teamMembers.length === 0 ? (
                <option value="" disabled>
                  No team members
                </option>
              ) : (
                teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void logout()}
            className="shrink-0 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
