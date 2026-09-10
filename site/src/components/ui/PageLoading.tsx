// Shown instantly on navigation while a page's JS chunk (and its recharts import)
// streams in, so clicking a nav link never feels like it did nothing.
export function PageLoading() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-14 sm:py-20">
        <div className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-3 h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="mt-8 space-y-4">
          <div className="h-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </main>
    </div>
  );
}
