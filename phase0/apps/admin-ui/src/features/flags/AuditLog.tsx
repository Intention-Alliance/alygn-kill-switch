import { useState, useEffect, useCallback } from 'react';
import type { AuditEntry } from './types';
import { fetchFlags, fetchFlagAudit } from './api';

interface AuditLogProps {
  flagId?: string;
}

export function AuditLog({ flagId }: AuditLogProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [flags, setFlags] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadFlags = useCallback(async () => {
    try {
      const data = await fetchFlags();
      setFlags(data.map((f) => ({ id: f.id, name: f.name })));
    } catch (err) {
      console.error('Failed to load flags for filter:', err);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let data: AuditEntry[];

      if (flagId) {
        data = await fetchFlagAudit(flagId);
      } else {
        data = await fetchFlags().then((allFlags) =>
          Promise.all(allFlags.map((f) => fetchFlagAudit(f.id).catch(() => [])))
        ).then((arrays) => arrays.flat());
      }

      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [flagId]);

  useEffect(() => {
    loadFlags();
    loadAudit();
  }, [loadFlags, loadAudit]);

  const filtered = entries.filter((entry) => {
    if (dateFrom && new Date(entry.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(entry.timestamp) > new Date(dateTo)) return false;
    if (flagFilter && entry.flagId !== flagFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportToCsv = () => {
    const headers = ['Timestamp', 'User', 'Flag ID', 'Action', 'Old Value', 'New Value', 'Trace ID'];
    const rows = filtered.map((e) => [
      e.timestamp,
      e.userId,
      e.flagId,
      e.action,
      e.oldValue,
      e.newValue,
      e.traceId,
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFlagFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Audit Log</h2>
        <button
          onClick={exportToCsv}
          disabled={filtered.length === 0}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-md transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Flag</label>
          <select
            value={flagFilter}
            onChange={(e) => {
              setFlagFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Flags</option>
            {flags.map((flag) => (
              <option key={flag.id} value={flag.id}>
                {flag.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={resetFilters}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading audit log...</div>
      ) : paginated.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {filtered.length === 0 ? 'No audit entries found' : 'No entries on this page'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Flag
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Change
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Trace ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {paginated.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{entry.userId}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {flags.find((f) => f.id === entry.flagId)?.name || entry.flagId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.action}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-red-600 font-mono">{entry.oldValue}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="text-green-600 font-mono">{entry.newValue}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500 truncate max-w-[150px]">
                      {entry.traceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}