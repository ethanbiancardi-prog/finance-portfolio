import Link from "next/link";

// One quiet row under every page. "Sign in" is the only way into the account
// area now that it's out of the nav: it points at /dashboard, which shows the
// dashboard when signed in and otherwise bounces to /login (proxy.ts), which
// sends you back to the dashboard afterwards. No session check here, so every
// page can stay static.
const linkClass = "transition-colors duration-150 hover:text-accent";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 text-[11px] text-zinc-500 sm:px-6 lg:px-10">
        <p>
          <span className="text-foreground">PRISM</span> · Ethan Biancardi · Educational, not investment advice.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/about#message" className={linkClass}>
            Contact
          </Link>
          <a href="https://github.com/ethanbiancardi-prog" target="_blank" rel="noreferrer" className={linkClass}>
            GitHub
          </a>
          <a href="https://www.linkedin.com/in/ethan-biancardi" target="_blank" rel="noreferrer" className={linkClass}>
            LinkedIn
          </a>
          <Link href="/dashboard" className={linkClass}>
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
