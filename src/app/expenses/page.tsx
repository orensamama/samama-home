import { redirect } from "next/navigation";

// The old "הוצאות גדולות" screen was upgraded into "כלכלת המשפחה". Existing
// expenses live on in the same table, so old links/bookmarks just land on
// the new screen.
export default function ExpensesRedirect() {
  redirect("/budget");
}
