import HomeButton from "@/components/HomeButton";

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-amber-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-amber-950/40 dark:bg-stone-950/95">
      <HomeButton />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-stone-800 dark:text-stone-50">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
