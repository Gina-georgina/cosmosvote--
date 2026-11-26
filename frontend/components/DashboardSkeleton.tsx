import React from 'react';

interface DashboardSkeletonProps {
  /**
   * When true, renders the analytics card grid skeleton used by
   * GovernanceAnalytics while metrics are being fetched/computed.
   */
  analytics?: boolean;
}

const shimmerClass =
  'animate-pulse rounded-md bg-gray-200 dark:bg-gray-700 motion-reduce:animate-none';

const AnalyticsCardSkeleton: React.FC = () => (
  <div
    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    data-testid="governance-analytics-skeleton-card"
  >
    <div className={`${shimmerClass} mb-3 h-4 w-1/2`} />
    <div className={`${shimmerClass} mb-2 h-8 w-2/3`} />
    <div className={`${shimmerClass} h-3 w-1/3`} />
  </div>
);

const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ analytics = false }) => {
  if (analytics) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        data-testid="governance-analytics-skeleton"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <AnalyticsCardSkeleton key={index} />
        ))}
      </section>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      data-testid="dashboard-skeleton"
      className="space-y-4"
    >
      <div className={`${shimmerClass} h-8 w-1/3`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`${shimmerClass} mb-3 h-4 w-1/2`} />
            <div className={`${shimmerClass} h-8 w-2/3`} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardSkeleton;
