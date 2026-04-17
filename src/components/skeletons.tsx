export function AgentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm animate-pulse">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-16 rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-8 rounded bg-gray-100 dark:bg-gray-800/60" />
      </div>
      <div className="mb-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mb-3 h-3 w-5/6 rounded bg-gray-100 dark:bg-gray-800/60" />
      <div className="mb-3 space-y-1.5">
        <div className="h-2.5 w-full rounded bg-gray-100 dark:bg-gray-800/60" />
        <div className="h-2.5 w-11/12 rounded bg-gray-100 dark:bg-gray-800/60" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-3 w-12 rounded bg-gray-100 dark:bg-gray-800/60" />
        <div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800/60" />
      </div>
    </div>
  );
}

export function AgentGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="animate-in fade-in duration-300">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-4 w-8 rounded-full bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <AgentCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function SummarySkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-3.5 w-4/5 rounded bg-gray-100 dark:bg-gray-800/60" />
        <div className="h-3.5 w-2/3 rounded bg-gray-100 dark:bg-gray-800/60" />
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 animate-pulse">
          <div className="mt-1 h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-4/5 rounded bg-gray-100 dark:bg-gray-800/60" />
            <div className="h-2.5 w-1/3 rounded bg-gray-100 dark:bg-gray-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
