import { useState, useEffect, useCallback } from 'react';
import type { Flag, FlagStatus } from './types';
import { FlagStatusBadge } from './FlagStatusBadge';
import { fetchFlags, toggleEmergency } from './api';

function getFlagStatus(flag: Flag): FlagStatus {
  if (!flag.enabled) return 'inactive';
  if (flag.rolloutPercentage > 0 && flag.rolloutPercentage < 100) return 'partial';
  return 'active';
}

interface FlagListProps {
  onEditFlag: (flag: Flag) => void;
}

export function FlagList({ onEditFlag }: FlagListProps) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FlagStatus | 'all'>('all');
  const [emergencyLoading, setEmergencyLoading] = useState(false);

  const loadFlags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFlags();
      setFlags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleEmergency = async () => {
    if (!confirm('Toggle emergency "all_chaos_disabled"? This affects all feature flags.')) return;
    try {
      setEmergencyLoading(true);
      await toggleEmergency();
      await loadFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Emergency toggle failed');
    } finally {
      setEmergencyLoading(false);
    }
  };

  const filtered = flags.filter((flag) => {
    const matchesSearch = flag.name.toLowerCase().includes(search.toLowerCase()) ||
      flag.key.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return getFlagStatus(flag) === statusFilter;
  });

  return (
    <div className="space-y-4">
      {/* Emergency Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-100">Feature Flags</h2>
        <button
          onClick={handleEmergency}
          disabled={emergencyLoading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold rounded-md shadow-sm transition-colors"
        >
          🚨 {emergencyLoading ? 'Toggling...' : 'all_chaos_disabled'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name or key..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-700 bg-gray-800 rounded-md text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FlagStatus | 'all')}
          className="px-3 py-2 border border-gray-700 bg-gray-800 rounded-md text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="partial">Partial</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading flags...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No flags found</div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rollout</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((flag) => (
                <tr
                  key={flag.id}
                  onClick={() => onEditFlag(flag)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{flag.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{flag.key}</td>
                  <td className="px-4 py-3 text-sm">
                    <FlagStatusBadge
                      status={getFlagStatus(flag)}
                      rolloutPercentage={flag.rolloutPercentage}
                      recentlyChanged={
                        Date.now() - new Date(flag.updatedAt).getTime() < 5 * 60 * 1000
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{flag.rolloutPercentage}%</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(flag.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}