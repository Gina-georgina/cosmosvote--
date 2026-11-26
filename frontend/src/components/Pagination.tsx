/**
 * Pagination — navigation controls for paginated proposal lists.
 *
 * Issue #270: Proposal pagination / virtual scrolling
 *
 * Features:
 *  - Previous / Next buttons with disabled state
 *  - Page number buttons for direct navigation (shows up to 5 page numbers)
 *  - "X–Y of Z proposals" summary with aria-live for screen reader announcements
 *  - Full keyboard navigation support
 *  - Dark-theme CSS custom-property support
 */

interface Props {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  /** Optional callback for direct page selection; renders numbered buttons when provided. */
  onPage?: (page: number) => void;
  /**
   * Optional callback invoked whenever the page changes (prev/next/direct).
   * Used to reset the virtualised proposal list scroll offset so the new page
   * starts at the top of the viewport.
   */
  onPageChange?: (page: number) => void;
}

/**
 * Build the list of page numbers to render.
 * Always includes page 1, last page, current page, and one neighbour on each
 * side. Gaps between non-consecutive numbers are represented as null.
 */
function buildPageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 1) return [];

  const window = new Set<number>();
  window.add(1);
  window.add(total);
  for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) {
    window.add(i);
  }

  const sorted = Array.from(window).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null); // ellipsis gap
    result.push(sorted[i]);
  }
  return result;
}

const btnBase: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  border: '1px solid var(--border-color, #d1d5db)',
  borderRadius: 6,
  fontSize: '0.875rem',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
  lineHeight: 1.4,
  minWidth: '2.25rem',
  textAlign: 'center',
};

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: disabled ? 'var(--bg-stat, #f3f4f6)' : 'var(--bg-card, #fff)',
    color: disabled ? 'var(--text-muted, #9ca3af)' : 'var(--text-primary, #1e293b)',
    cursor: disabled ? 'default' : 'pointer',
  };
}

function pageBtnStyle(isCurrent: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: isCurrent ? '#3b82f6' : 'var(--bg-card, #fff)',
    color: isCurrent ? '#fff' : 'var(--text-primary, #1e293b)',
    borderColor: isCurrent ? '#3b82f6' : 'var(--border-color, #d1d5db)',
    fontWeight: isCurrent ? 700 : undefined,
    cursor: isCurrent ? 'default' : 'pointer',
  };
}

export function Pagination({ page, totalPages, totalCount, pageSize, onPrev, onNext, onPage, onPageChange }: Props) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const summaryText = totalCount === 0
    ? '0 proposals'
    : `${start}–${end} of ${totalCount} proposal${totalCount !== 1 ? 's' : ''}`;

  const pageNumbers = onPage ? buildPageNumbers(page, totalPages) : [];

  const handlePrev = () => {
    if (page <= 1) return;
    onPrev();
    onPageChange?.(page - 1);
  };

  const handleNext = () => {
    if (page >= totalPages) return;
    onNext();
    onPageChange?.(page + 1);
  };

  const handlePage = (num: number) => {
    if (num === page) return;
    onPage?.(num);
    onPageChange?.(num);
  };

  return (
    <nav
      aria-label="Proposal list pagination"
      style={{ marginTop: '1.5rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        {/* Summary — announced to screen readers when content updates */}
        <span
          aria-live="polite"
          aria-atomic="true"
          style={{ fontSize: '0.875rem', color: 'var(--text-muted, #888)' }}
        >
          {summaryText}
        </span>

        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Previous */}
          <button
            onClick={handlePrev}
            disabled={page <= 1}
            aria-label="Go to previous page"
            style={navBtnStyle(page <= 1)}
          >
            ← Prev
          </button>

          {/* Numbered page buttons */}
          {pageNumbers.map((num, idx) =>
            num === null ? (
              <span
                key={`ellipsis-${idx}`}
                aria-hidden="true"
                style={{ padding: '0.4rem 0.25rem', color: 'var(--text-muted, #888)', fontSize: '0.875rem' }}
              >
                …
              </span>
            ) : (
              <button
                key={num}
                onClick={() => handlePage(num)}
                disabled={num === page}
                aria-label={`Go to page ${num}`}
                aria-current={num === page ? 'page' : undefined}
                style={pageBtnStyle(num === page)}
              >
                {num}
              </button>
            )
          )}

          {/* Current / total display when no onPage handler */}
          {!onPage && (
            <span
              aria-label={`Page ${page} of ${totalPages || 1}`}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary, #555)' }}
            >
              {page} / {totalPages || 1}
            </span>
          )}

          {/* Next */}
          <button
            onClick={handleNext}
            disabled={page >= totalPages}
            aria-label="Go to next page"
            style={navBtnStyle(page >= totalPages)}
          >
            Next →
          </button>
        </div>
      </div>
    </nav>
  );
}
