import React from 'react';

interface ProposalSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Skeleton placeholder for proposal cards.
 *
 * Also used by GovernanceAnalytics to render a card-grid placeholder while
 * analytics metrics are being fetched/computed on mount. Animation is
 * suppressed when the user prefers reduced motion.
 */
const ProposalSkeleton: React.FC<ProposalSkeletonProps> = ({ count = 3, className = '' }) => {
  const items = Array.from({ length: count });

  return (
    <div
      className={`proposal-skeleton-grid ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading proposals"
    >
      {items.map((_, index) => (
        <div key={index} className="proposal-skeleton-card" data-testid="proposal-skeleton-card">
          <div className="proposal-skeleton-line proposal-skeleton-line--title" />
          <div className="proposal-skeleton-line proposal-skeleton-line--subtitle" />
          <div className="proposal-skeleton-line proposal-skeleton-line--body" />
          <div className="proposal-skeleton-line proposal-skeleton-line--body proposal-skeleton-line--short" />
          <div className="proposal-skeleton-footer">
            <div className="proposal-skeleton-badge" />
            <div className="proposal-skeleton-badge proposal-skeleton-badge--wide" />
          </div>
        </div>
      ))}

      <style jsx>{`
        .proposal-skeleton-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
          width: 100%;
        }

        .proposal-skeleton-card {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.5rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .proposal-skeleton-line,
        .proposal-skeleton-badge {
          border-radius: 6px;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.06) 25%,
            rgba(255, 255, 255, 0.14) 37%,
            rgba(255, 255, 255, 0.06) 63%
          );
          background-size: 400% 100%;
          animation: proposal-skeleton-shimmer 1.4s ease infinite;
        }

        .proposal-skeleton-line--title {
          height: 1.25rem;
          width: 70%;
        }

        .proposal-skeleton-line--subtitle {
          height: 0.875rem;
          width: 45%;
        }

        .proposal-skeleton-line--body {
          height: 0.75rem;
          width: 100%;
        }

        .proposal-skeleton-line--short {
          width: 80%;
        }

        .proposal-skeleton-footer {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .proposal-skeleton-badge {
          height: 1.5rem;
          width: 4rem;
        }

        .proposal-skeleton-badge--wide {
          width: 6rem;
        }

        @keyframes proposal-skeleton-shimmer {
          0% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0 50%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .proposal-skeleton-line,
          .proposal-skeleton-badge {
            animation: none;
            background: rgba(255, 255, 255, 0.08);
          }
        }
      `}</style>
    </div>
  );
};

export default ProposalSkeleton;
