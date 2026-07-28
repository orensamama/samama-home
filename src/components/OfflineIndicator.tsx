"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { onQueueChange, pendingCount } from "@/lib/syncQueue";

/**
 * Shows up only when there's something to say: either the device is
 * offline, or there are queued shopping-list changes still waiting to
 * sync (including right after reconnecting, until the queue drains).
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    // Hydrating from external browser APIs (navigator.onLine, the queue's
    // current length) that can't be known during server render -- the
    // documented exception useEffect exists for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    setPending(pendingCount());

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const unsubscribe = onQueueChange(() => setPending(pendingCount()));

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      unsubscribe();
    };
  }, []);

  if (isOnline && pending === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
      {isOnline ? <RefreshCw className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
      {isOnline
        ? `מסנכרן ${pending} שינויים שנשמרו במצב אופליין...`
        : "אין חיבור לרשת - השינויים נשמרים מקומית ויסונכרנו אוטומטית"}
    </div>
  );
}
