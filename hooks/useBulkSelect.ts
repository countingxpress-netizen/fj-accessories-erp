"use client";
import { useCallback, useMemo, useState } from "react";

/**
 * Generic row-selection state for list-page bulk actions.
 * Selection is keyed by string id so it survives re-renders/re-fetches
 * as long as ids stay stable (selection is NOT cleared automatically
 * when `items` changes — call `clear()` after a bulk action completes).
 */
export function useBulkSelect<T>(items: T[], getId: (item: T) => string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ids = useMemo(() => items.map(getId), [items, getId]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isAllSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selectedIds: Array.from(selected),
    selectedCount: selected.size,
    isSelected,
    toggle,
    toggleAll,
    isAllSelected,
    isSomeSelected,
    clear,
  };
}
