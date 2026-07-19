import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/paper-trading", label: "Paper Trading" },
  { href: "/statement-analyzer", label: "10-K Analyzer" },
];

export default function Nav() {
  return (
    <nav className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl gap-6 px-6 py-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
