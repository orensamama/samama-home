export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-amber-100 bg-white/95 px-4 py-4 backdrop-blur dark:border-amber-950/40 dark:bg-stone-950/95">
      <h1 className="text-xl font-bold text-stone-800 dark:text-stone-50">{title}</h1>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
      ) : null}
    </header>
  );
}
