import React, { useEffect, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface GovernanceMetrics {
  totalProposals: number;
  activeProposals: number;
  passedProposals: number;
  rejectedProposals: number;
  participationRate: number;
  averageTurnout: number;
}

interface GovernanceAnalyticsProps {
  fetchMetrics?: () => Promise<GovernanceMetrics>;
}

const defaultMetrics: GovernanceMetrics = {
  totalProposals: 0,
  activeProposals: 0,
  passedProposals: 0,
  rejectedProposals: 0,
  participationRate: 0,
  averageTurnout: 0,
};

const metricCards: { key: keyof GovernanceMetrics; label: string }[] = [
  { key: 'totalProposals', label: 'Total Proposals' },
  { key: 'activeProposals', label: 'Active Proposals' },
  { key: 'passedProposals', label: 'Passed Proposals' },
  { key: 'rejectedProposals', label: 'Rejected Proposals' },
  { key: 'participationRate', label: 'Participation Rate' },
  { key: 'averageTurnout', label: 'Average Turnout' },
];

const GovernanceAnalyticsSkeleton: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const pulseClass = prefersReducedMotion ? '' : 'animate-pulse';

  return (
    <div
      className="governance-analytics"
      role="status"
      aria-busy="true"
      aria-label="Loading governance analytics"
    >
      <div className="governance-analytics__grid">
        {metricCards.map((card) => (
          <div
            key={card.key}
            className={`governance-analytics__card ${pulseClass}`.trim()}
          >
            <div className="governance-analytics__skeleton-label" />
            <div className="governance-analytics__skeleton-value" />
          </div>
        ))}
      </div>
    </div>
  );
};

const GovernanceAnalytics: React.FC<GovernanceAnalyticsProps> = ({ fetchMetrics }) => {
  const [metrics, setMetrics] = useState<GovernanceMetrics>(defaultMetrics);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const result = fetchMetrics
          ? await fetchMetrics()
          : defaultMetrics;
        if (isMounted) {
          setMetrics(result);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [fetchMetrics]);

  if (loading) {
    return <GovernanceAnalyticsSkeleton />;
  }

  return (
    <div className="governance-analytics">
      <div className="governance-analytics__grid">
        {metricCards.map((card) => (
          <div key={card.key} className="governance-analytics__card">
            <span className="governance-analytics__label">{card.label}</span>
            <span className="governance-analytics__value">{metrics[card.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GovernanceAnalytics;
