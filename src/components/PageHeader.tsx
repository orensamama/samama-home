export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      ) : null}
    </header>
  );
}
