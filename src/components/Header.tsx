import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex flex-col items-start gap-0.5">
          <Image
            src="/hydrogenera-logo.png"
            alt="Hydrogenera"
            width={110}
            height={18}
            priority
            className="h-4 w-auto sm:h-[18px]"
          />
          <span className="text-[14px] leading-none text-muted mt-1">
            Sales Tracker
          </span>
        </Link>
      </div>
    </header>
  );
}
