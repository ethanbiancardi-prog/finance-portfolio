// Shown instantly on navigation while a page's JS chunk (and its recharts import)
// streams in, so clicking a nav link never feels like it did nothing.
export function PageLoading() {
  const bar = "animate-pulse bg-border";
  return (
    <div className="flex flex-1 flex-col bg-background font-mono">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="border-b border-border pb-5">
          <div className={`h-2.5 w-20 ${bar}`} />
          <div className={`mt-3 h-6 w-48 ${bar}`} />
        </div>
        <div className="mt-6 space-y-3">
          <div className={`h-20 ${bar}`} />
          <div className={`h-20 ${bar}`} />
          <div className={`h-40 ${bar}`} />
        </div>
      </main>
    </div>
  );
}
