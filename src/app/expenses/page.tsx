import PageHeader from "@/components/PageHeader";

export default function ExpensesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="הוצאות גדולות" subtitle="מעקב אחר ההוצאות המשפחתיות" />

      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          אין עדיין הוצאות רשומות. בקרוב ניתן יהיה להוסיף הוצאות חדשות כאן.
        </div>
      </div>
    </div>
  );
}
