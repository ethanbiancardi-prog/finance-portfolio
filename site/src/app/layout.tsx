import type { Metadata } from "next";
import { EB_Garamond, Fraunces, Geist, Geist_Mono, Newsreader } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Two display serifs, both loaded so the look can be compared side by side.
// Which one the site actually uses is decided by --font-display in
// globals.css — change that one line to switch.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

// Body and prose face. Garamond has a small x-height, so it is set a couple
// of pixels larger than the sans it replaced (see body in globals.css).
const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ethan Biancardi, Finance x AI",
  description:
    "Finance x AI portfolio: working finance tools built with modern AI.",
};

// Applies the user's saved theme (mode + accent + style) to <html> before first
// paint, so there's no flash of the default amber/system theme on load.
// Must run synchronously, before any CSS-dependent paint — a plain inline
// script, not a useEffect (which would run after paint). data-mode is
// always resolved to a concrete "light"/"dark" (never left unset) since
// globals.css's dark: variant and CSS vars key off this attribute directly,
// with no separate prefers-color-scheme fallback to stay in sync with.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('theme-mode')||'dark';var a=localStorage.getItem('theme-accent');var s=localStorage.getItem('theme-style');var isDark=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.setAttribute('data-mode',isDark?'dark':'light');if(a&&a!=='amber')r.setAttribute('data-accent',a);if(s!=='terminal')r.setAttribute('data-style','modern');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${fraunces.variable} ${ebGaramond.variable} h-full antialiased`}
      // The inline script below sets data-mode/data-accent on this element
      // before hydration runs, so its attributes intentionally differ from
      // what was server-rendered — the standard, documented fix for this
      // exact pattern (also used by next-themes).
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
