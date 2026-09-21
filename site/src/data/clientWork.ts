export type CaseStudy = {
  id: string;
  title: string;
  client: string;
  industry: string;
  timeline: string;
  role: string;
  tags: string[];
  summary: string;
  problem: string;
  whatShipped: {
    overview: string;
    highlights: string[];
  };
  results: {
    metric: string;
    label: string;
  }[];
  learnings: string;
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "retail-inventory-sync",
    title: "E-Commerce & Multi-Channel Inventory Engine",
    client: "New England Apparel & Goods",
    industry: "Retail / E-Commerce",
    timeline: "2025",
    role: "Lead Full-Stack Developer",
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "REST APIs", "Vercel"],
    summary:
      "Engineered an automated stock synchronization portal linking their physical POS inventory with their online storefront to eliminate stockouts and double-selling.",
    problem:
      "The client was manually reconciling inventory between in-store sales and online orders each evening. Peak holiday shopping led to overselling out-of-stock items, resulting in refunded orders, frustrated customers, and an estimated 10+ hours wasted on manual data entry every week.",
    whatShipped: {
      overview:
        "A streamlined web app and webhook consumer that updates stock quantities across channels in real-time, coupled with a lightweight internal dashboard for staff.",
      highlights: [
        "Real-time webhook triggers to instantly decrement available quantities when an in-store transaction completes.",
        "Mobile-friendly staff dashboard allowing quick barcode lookup, quantity overrides, and re-order threshold alerts.",
        "Automatic reconciliation log capturing all adjustments with timestamps for auditing.",
      ],
    },
    results: [
      { metric: "100%", label: "Reduction in oversold inventory errors" },
      { metric: "~12 hrs/wk", label: "Manual reconciliation time eliminated" },
      { metric: "< 2.5s", label: "Average sync latency between POS and online" },
    ],
    learnings:
      "Handling edge cases like concurrent sales during high-traffic flash sales taught me the importance of idempotency keys, race-condition management, and clear UI status indicators.",
  },
  {
    id: "consulting-client-portal",
    title: "Automated Booking & Client Intake Portal",
    client: "Apex Financial Advisory",
    industry: "Financial Services / Consulting",
    timeline: "2025",
    role: "Frontend & Integration Developer",
    tags: ["React", "Next.js", "Tailwind CSS", "Stripe API", "Cal.com API"],
    summary:
      "Built an intuitive onboarding flow and client intake portal for an independent advisory practice, integrating dynamic questionnaires, payment collection, and calendar booking.",
    problem:
      "Prospective wealth management clients had to exchange multiple back-and-forth emails, download and fill out static PDF risk questionnaires, and wait days for scheduling confirmation, causing high drop-off before the initial discovery call.",
    whatShipped: {
      overview:
        "A branded, responsive client intake experience that guides clients step-by-step through their financial profile, collects consultation fees securely via Stripe, and automatically schedules the intake meeting.",
      highlights: [
        "Multi-step interactive financial questionnaire with client-side validation and auto-save.",
        "Embedded calendar reservation system synced with advisor availability and time zone conversion.",
        "Advisor summary digest sent immediately to the advisor's inbox with pre-calculated risk profiling metrics.",
      ],
    },
    results: [
      { metric: "+45%", label: "Increase in completed client consultations" },
      { metric: "0", label: "Manual scheduling emails required per client" },
      { metric: "99.8%", label: "Mobile intake completion rate without errors" },
    ],
    learnings:
      "Designing for non-technical clients reinforced the value of zero-jargon copy, visible progress bars, and resilient local-storage drafts so users never lose form progress.",
  },
  {
    id: "contractor-lead-engine",
    title: "High-Speed Website Redesign & Lead Funnel",
    client: "Beacon Custom Construction",
    industry: "Home Services & Contracting",
    timeline: "2025",
    role: "Web Developer & Designer",
    tags: ["Next.js", "Tailwind CSS", "SEO", "Vercel Analytics"],
    summary:
      "Complete ground-up redesign of an outdated WordPress site into a modern, lightning-fast web experience with interactive project galleries and an instant estimate calculator.",
    problem:
      "The client's previous website took over 6 seconds to load on mobile devices, suffered from poor local search rankings, and had a generic contact form with a low 2% inquiry conversion rate.",
    whatShipped: {
      overview:
        "A modern web application built on Next.js and Tailwind CSS with sub-second page loads, interactive before/after photo sliders, and an interactive cost estimator that qualifies leads before they submit.",
      highlights: [
        "Interactive cost estimator that provides ballpark price ranges based on square footage and materials.",
        "Optimized image delivery pipeline serving modern WebP/AVIF formats with responsive srcset sizes.",
        "Structured schema markup for local SEO and rich search snippets.",
      ],
    },
    results: [
      { metric: "98 / 100", label: "Mobile Google PageSpeed Performance score (up from 34)" },
      { metric: "+130%", label: "Increase in qualified monthly quote requests" },
      { metric: "< 0.8s", label: "Largest Contentful Paint (LCP) load time" },
    ],
    learnings:
      "Demonstrated how direct speed optimizations and interactive estimators directly impact customer conversion rates for small businesses.",
  },
];
