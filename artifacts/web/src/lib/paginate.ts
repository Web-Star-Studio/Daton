/**
 * Client-side pagination over an already-complete list.
 *
 * Used where the full (server-filtered) set is already in memory and we only want
 * to page the DOM — e.g. the training catalog, which fetches every item to stay
 * count-independent but should not render all 800+ cards at once. Clamps the page
 * into range so a filter that shrinks the list never leaves the view on an empty
 * page past the end.
 */
export function paginateList<T>(
  items: T[],
  page: number,
  pageSize: number,
): { pageItems: T[]; page: number; total: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: clampedPage,
    total,
    totalPages,
  };
}
