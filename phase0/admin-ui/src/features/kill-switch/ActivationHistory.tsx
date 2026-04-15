import { useState, useEffect, useCallback } from 'react';
import type { ActivationRecord, KillSwitchState } from './types';
import { getActivations } from './api';

interface ActivationHistoryProps {
  className?: string;
}

const PAGE_SIZE = 20;

export function ActivationHistory({ className = '' }: ActivationHistoryProps) {
  const [records, setRecords] = useState<ActivationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getActivations({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page,
        limit: PAGE_SIZE,
        user: userFilter || undefined,
      });
      setRecords(response.data);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activation history');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, userFilter]);

  // Initial load
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const exportToCsv = () => {
    const headers = ['Timestamp', 'User', 'Reason', 'Previous State', 'New State', 'Trace ID'];
    const rows = records.map((r) => [
      r.timestamp,
      r.user,
      r.reason,
      r.previousState,
      r.newState,
      r.traceId,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kill-switch-activations-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setUserFilter('');
    setPage(1);
  };

  const stateColor: Record<KillSwitchState, string> = {
    ARMED: 'text-green-400',
    RUNNING: 'text-yellow-400',
    STOPPING: 'text-orange-400',
    STOPPED: 'text-red-400',
    LOCKED: 'text-red-400',
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-100">Activation History</h2>
        <button
          onClick={exportToCsv}
          disabled={records.length === 0}
          className="btn-secondary text-sm"
        >
          📥 Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="input text-sm w-auto"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="input text-sm w-auto"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">User</label>
          <input
            type="text"
            placeholder="Filter by user..."
            value={userFilter}
            onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
            className="input text-sm w-48"
          />
        </div>
        <button onClick={resetFilters} className="btn-secondary text-sm">
          Reset
        </button>
        <button onClick={loadRecords} className="btn-primary text-sm">
          Search
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading history...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No activation records found</div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-800 rounded-lg">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State Change</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trace ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {records.map((record) => (
                  <tr key={record.id} className="table-row">
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {new Date(record.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-200 font-medium">
                      {record.user}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">
                      {record.reason}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={stateColor[record.previousState]}>
                        {record.previousState}
                      </span>
                      <span className="mx-2 text-gray-600">→</span>
                      <span className={stateColor[record.newState]}>
                        {record.newState}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 max-w-[120px] truncate">
                      {record.traceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1 text-sm text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}