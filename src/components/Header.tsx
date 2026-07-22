import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-accent text-sm font-bold text-white">
            H2
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold tracking-[0.15em] text-teal-accent">
              HYDR<span className="text-olive">O</span>GENERA
            </span>
            <span className="block text-xs text-muted">Sales Tracker</span>
          </span>
        </Link>
        <span className="hidden text-xs uppercase tracking-wide text-muted sm:block">
          Electrolyser projects · lead to commissioning
        </span>
      </div>
    </header>
  );
}
