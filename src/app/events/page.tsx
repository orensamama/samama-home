import PageHeader from "@/components/PageHeader";

export default function EventsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="תאריכים והוצאות" subtitle="אירועים קרובים ומעקב תקציב" />

      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          אין עדיין אירועים או הוצאות רשומות. בקרוב ניתן יהיה להוסיף כאן.
        </div>
      </div>
    </div>
  );
}
