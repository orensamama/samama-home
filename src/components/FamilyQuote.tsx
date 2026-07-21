"use client";

import { useEffect, useState } from "react";
import { Quote } from "lucide-react";

const QUOTES = [
  "לך יש אותי, לי יש אותך, לנו יש אותנו",
  "יחד אנחנו הבית הכי טוב שיש",
  "משפחה היא לא דבר חשוב, היא הכל",
  "הכי טוב לי כשכולנו יחד תחת אותה קורת גג",
  "בית מלא אהבה הוא הבית הכי חזק שיש",
];

export default function FamilyQuote() {
  const [quote, setQuote] = useState(QUOTES[0]);

  useEffect(() => {
    // Randomize only after mount so the server-rendered quote matches the
    // client's initial render, avoiding a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  return (
    <div className="mt-3 flex max-w-xs items-center gap-2 rounded-2xl bg-white/80 px-4 py-2.5 text-sm text-zinc-600 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/70 dark:text-zinc-300 dark:ring-zinc-800">
      <Quote className="h-4 w-4 shrink-0 text-teal-500" aria-hidden="true" />
      <span className="italic">{quote}</span>
    </div>
  );
}
