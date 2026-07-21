import ChecklistPage from "@/components/ChecklistPage";

export default function TasksPage() {
  return (
    <ChecklistPage
      table="tasks"
      title="משימות"
      subtitle="ניהול המשימות המשפחתיות"
      placeholder="משימה חדשה..."
      emptyText="אין משימות עדיין. הוסיפו את המשימה הראשונה!"
    />
  );
}
