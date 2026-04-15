import type { FlagStatus } from './types';

interface FlagStatusBadgeProps {
  status: FlagStatus;
  rolloutPercentage?: number;
  recentlyChanged?: boolean;
}

const statusConfig: Record<FlagStatus, { dot: string; label: string }> = {
  active: { dot: 'bg-green-500', label: 'Active' },
  inactive: { dot: 'bg-gray-400', label: 'Inactive' },
  partial: { dot: 'bg-yellow-500', label: 'Partial' },
};

export function FlagStatusBadge({ status, rolloutPercentage, recentlyChanged = false }: FlagStatusBadgeProps) {
  const config = statusConfig[status];
  const pulseClass = recentlyChanged ? 'animate-pulse' : '';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dot} ${pulseClass}`} />
      <span className="text-sm text-gray-700">{config.label}</span>
      {status === 'partial' && rolloutPercentage !== undefined && (
        <span className="text-xs text-gray-500">({rolloutPercentage}%)</span>
      )}
    </span>
  );
}