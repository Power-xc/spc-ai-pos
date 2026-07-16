import { useState, useMemo } from "react";

interface UsePaginationResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  resetPage: () => void;
}

export function usePagination<T>(
  allItems: T[],
  pageSize: number,
): UsePaginationResult<T> {
  const [page, setPageState] = useState(1);

  const totalPages = Math.ceil(allItems.length / pageSize);

  const items = useMemo(
    () => allItems.slice((page - 1) * pageSize, page * pageSize),
    [allItems, page, pageSize],
  );

  function setPage(next: number) {
    setPageState(Math.max(1, Math.min(next, Math.ceil(allItems.length / pageSize))));
  }

  function resetPage() {
    setPageState(1);
  }

  return { items, page, totalPages, setPage, resetPage };
}
