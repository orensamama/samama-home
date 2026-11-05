import Link from "next/link";
import { House } from "lucide-react";

/** The app's logo / home button: one tap from any screen back to the dashboard. */
export default function HomeButton() {
  return (
    <Link
      href="/"
      aria-label="Samama Home - חזרה לדשבורד"
      title="Samama Home"
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-amber-100 px-2.5 text-amber-700 transition-colors hover:bg-amber-200 active:scale-95 dark:bg-amber-950/50 dark:text-amber-400 dark:hover:bg-amber-950/80"
    >
      <House className="h-5 w-5" />
      <span className="hidden text-xs font-bold sm:inline">Samama Home</span>
    </Link>
  );
}
