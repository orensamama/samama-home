import { createClient } from "@supabase/supabase-js";

// Public iCalendar feed of all family events, for subscribing via
// Google Calendar's "From URL" import. Uses the anon key -- same
// permissive read access the rest of the app already has, no secrets
// involved.
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("Missing Supabase configuration", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, event_date, time, location, notes")
    .order("event_date", { ascending: true });

  if (error) {
    return new Response(`Failed to load events: ${error.message}`, { status: 500 });
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Samama Home//Events//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:בית סממה",
  ];

  for (const event of events ?? []) {
    const dateCompact = event.event_date.replaceAll("-", "");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@samama-home`);
    lines.push(`DTSTAMP:${toUtcStamp(new Date())}`);
    if (event.time) {
      const timeCompact = String(event.time).replace(/:/g, "").slice(0, 6).padEnd(6, "0");
      lines.push(`DTSTART:${dateCompact}T${timeCompact}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=samama-home.ics",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function toUtcStamp(date: Date) {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeIcsText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}
