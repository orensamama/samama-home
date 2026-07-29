/**
 * Lightweight pulsing placeholders shown only during a genuine first-ever
 * fetch (no cached data yet at all) -- everywhere else useSupabaseTable's
 * stale-while-revalidate cache means real content is already on screen.
 * Prevents a misleading "empty" message from flashing before real data
 * arrives, which reads as the app being stuck.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-amber-100/60 dark:bg-stone-800/60 ${className}`} />;
}

export function SkeletonList({ count = 3, itemClassName = "h-16" }: { count?: number; itemClassName?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBlock key={index} className={`w-full ${itemClassName}`} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBlock key={index} className="h-20" />
      ))}
    </div>
  );
}
