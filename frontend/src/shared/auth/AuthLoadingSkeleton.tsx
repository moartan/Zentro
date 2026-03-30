export default function AuthLoadingSkeleton() {
  return (
    <div className="px-4 pb-14 pt-10 md:px-6 md:pt-14">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-background/90 p-6 md:p-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-secondary/70" />
        <div className="mt-3 h-4 w-72 animate-pulse rounded-lg bg-secondary/60" />

        <div className="mt-8 space-y-4">
          <div className="space-y-2">
            <div className="h-3 w-16 animate-pulse rounded bg-secondary/60" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-secondary/70" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-secondary/60" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-secondary/70" />
          </div>
          <div className="h-11 w-full animate-pulse rounded-xl bg-primary/30" />
        </div>
      </div>
    </div>
  );
}

