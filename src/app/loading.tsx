export default function Loading() {
  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <div className="h-14 w-full animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
        <div className="h-20 animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
      </div>
      <div className="h-16 w-full animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
      <div className="h-16 w-full animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
      <div className="h-16 w-full animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60" />
    </div>
  );
}
