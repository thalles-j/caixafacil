import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { DEFAULT_PAGE_SIZE, getPagination } from '../lib/pagination';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  itemLabel?: string;
}

function visiblePages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push('ellipsis');
    result.push(page);
  });
  return result;
}

export default function Pagination({
  currentPage,
  totalItems,
  onPageChange,
  pageSize = DEFAULT_PAGE_SIZE,
  itemLabel = 'registros',
}: PaginationProps) {
  const meta = getPagination(totalItems, currentPage, pageSize);
  if (meta.totalPages <= 1) return null;

  const changePage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), meta.totalPages);
    if (nextPage !== meta.currentPage) onPageChange(nextPage);
  };

  return (
    <nav
      aria-label={`Paginação de ${itemLabel}`}
      className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised px-3 py-3 sm:flex-row"
    >
      <p className="text-xs text-ink-soft">
        Exibindo <strong className="text-ink">{meta.from}–{meta.to}</strong> de{' '}
        <strong className="text-ink">{totalItems}</strong> {itemLabel}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => changePage(meta.currentPage - 1)}
          disabled={meta.currentPage === 1}
          aria-label="Página anterior"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink transition hover:bg-line/30 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <CaretLeft size={16} weight="bold" />
        </button>

        <span className="px-2 font-ledger text-xs font-bold text-ink sm:hidden">
          {meta.currentPage} / {meta.totalPages}
        </span>
        <div className="hidden items-center gap-1 sm:flex">
          {visiblePages(meta.currentPage, meta.totalPages).map((page, index) =>
            page === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="flex h-9 w-7 items-center justify-center text-xs text-ink-soft">
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => changePage(page)}
                aria-label={`Ir para a página ${page}`}
                aria-current={page === meta.currentPage ? 'page' : undefined}
                className={`h-9 min-w-9 rounded-lg px-2 font-ledger text-xs font-bold transition ${
                  page === meta.currentPage
                    ? 'bg-ledger text-paper shadow-sm'
                    : 'border border-line text-ink hover:bg-line/30'
                }`}
              >
                {page}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => changePage(meta.currentPage + 1)}
          disabled={meta.currentPage === meta.totalPages}
          aria-label="Próxima página"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink transition hover:bg-line/30 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>
    </nav>
  );
}
