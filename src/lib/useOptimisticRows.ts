"use client";

import { useState } from "react";

/**
 * Mirrors a server-driven row list locally so a mutation can be reflected
 * in the UI instantly (no waiting on the network round-trip or the
 * realtime echo). Re-syncs to the server list whenever it changes, so any
 * optimistic patch is naturally reconciled -- or reverted, via `reset` --
 * once the real data arrives.
 *
 * Adjusts state during render (the documented pattern for "reset state
 * when a prop changes") rather than in a useEffect, so the sync happens
 * before paint instead of triggering an extra cascading render.
 */
export function useOptimisticRows<T extends { id: string }>(serverRows: T[]) {
  const [prevServerRows, setPrevServerRows] = useState(serverRows);
  const [rows, setRows] = useState(serverRows);

  if (serverRows !== prevServerRows) {
    setPrevServerRows(serverRows);
    setRows(serverRows);
  }

  function patch(id: string, changes: Partial<T>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function remove(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function reset() {
    setRows(serverRows);
  }

  return { rows, patch, remove, reset };
}
