import PageHeader from "@/components/PageHeader";

export default function ShoppingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="קניות" subtitle="רשימת הקניות של המשפחה" />

      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          רשימת הקניות ריקה. בקרוב ניתן יהיה להוסיף פריטים כאן.
        </div>
      </div>
    </div>
  );
}
