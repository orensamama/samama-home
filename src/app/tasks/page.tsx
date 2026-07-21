import PageHeader from "@/components/PageHeader";

export default function TasksPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="משימות" subtitle="ניהול המשימות המשפחתיות" />

      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          אין עדיין משימות. בקרוב ניתן יהיה להוסיף משימות חדשות כאן.
        </div>
      </div>
    </div>
  );
}
