import ChecklistPage from "@/components/ChecklistPage";

export default function ShoppingPage() {
  return (
    <ChecklistPage
      table="shopping"
      title="קניות"
      subtitle="רשימת הקניות של המשפחה"
      placeholder="פריט חדש..."
      emptyText="רשימת הקניות ריקה. הוסיפו את הפריט הראשון!"
    />
  );
}
