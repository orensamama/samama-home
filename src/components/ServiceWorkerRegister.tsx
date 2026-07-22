"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app works fine without the SW, just without the
        // repeat-visit static-asset caching speedup.
      });
    }
  }, []);

  return null;
}
