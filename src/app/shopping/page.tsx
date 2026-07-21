import PageHeader from "@/components/PageHeader";

export default function ShoppingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="קניות" subtitle="רשימת הקניות של המשפחה" />

      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          רשימת הקניות ריקה. בקרוב ניתן יהיה להוסיף פריטים כאן.
        </div>
      </div>
    </div>
  );
}
