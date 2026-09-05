"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/paper-trading", label: "Paper Trading" },
  { href: "/rotation", label: "Sector Rotation" },
  { href: "/dcf-builder", label: "DCF Builder" },
  { href: "/statement-analyzer", label: "10-K Analyzer" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 sm:gap-x-6">
        <span className="font-mono text-sm text-accent">●</span>
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`font-mono text-xs uppercase tracking-wide transition-colors duration-150 ease-out sm:tracking-widest ${
                active
                  ? "text-accent"
                  : "text-zinc-500 hover:text-accent dark:text-zinc-400"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
