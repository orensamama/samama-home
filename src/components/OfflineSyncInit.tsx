"use client";

import { useEffect } from "react";
import { initSyncQueue } from "@/lib/syncQueue";

/** Mounted once app-wide: replays any pending offline actions on load and whenever the connection comes back. */
export default function OfflineSyncInit() {
  useEffect(() => {
    initSyncQueue();
  }, []);

  return null;
}
