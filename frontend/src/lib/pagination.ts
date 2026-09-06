export const DEFAULT_PAGE_SIZE = 15;

export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  from: number;
  to: number;
}

export function getPagination(
  totalItems: number,
  requestedPage: number,
  pageSize = DEFAULT_PAGE_SIZE,
): PaginationMeta {
  const safeTotal = Math.max(0, Math.floor(totalItems));
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, safeTotal);

  return {
    currentPage,
    totalPages,
    pageSize: safePageSize,
    startIndex,
    endIndex,
    from: safeTotal === 0 ? 0 : startIndex + 1,
    to: endIndex,
  };
}

export function paginateItems<T>(items: readonly T[], requestedPage: number, pageSize = DEFAULT_PAGE_SIZE) {
  const meta = getPagination(items.length, requestedPage, pageSize);
  return {
    ...meta,
    items: items.slice(meta.startIndex, meta.endIndex),
  };
}
