import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import CustomCursor from "@/components/CustomCursor";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ethan Biancardi — Finance x AI",
  description:
    "Finance x AI portfolio: working finance tools built with modern AI.",
};

// Applies the user's saved theme (mode + accent) to <html> before first
// paint, so there's no flash of the default amber/system theme on load.
// Must run synchronously, before any CSS-dependent paint — a plain inline
// script, not a useEffect (which would run after paint). data-mode is
// always resolved to a concrete "light"/"dark" (never left unset) since
// globals.css's dark: variant and CSS vars key off this attribute directly,
// with no separate prefers-color-scheme fallback to stay in sync with.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('theme-mode')||'dark';var a=localStorage.getItem('theme-accent');var isDark=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.setAttribute('data-mode',isDark?'dark':'light');if(a&&a!=='amber')r.setAttribute('data-accent',a);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        <CustomCursor />
        <Nav />
        {children}
      </body>
    </html>
  );
}
