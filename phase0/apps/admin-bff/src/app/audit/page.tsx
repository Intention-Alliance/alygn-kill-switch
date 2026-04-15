'use client';

// Ollama Audit Log — NEW page for BFF
// Shows Ollama API request history from Supabase audit table

import { useState, useEffect } from 'react';

interface AuditEntry {
  id: string;
  created_at: string;
  model: string;
  method: string;
  endpoint: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  client_ip: string;
  status_code: number;
  latency_ms: number;
  error_message: string | null;
  kill_switch_state: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (modelFilter) params.set('model', modelFilter);
        const res = await fetch(`/api/audit/ollama?${params}`);
        const data = await res.json();
        setEntries(data.entries || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit log');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [modelFilter]);

  const statusColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-green-400';
    if (code >= 400 && code < 500) return 'text-yellow-400';
    return 'text-red-400';
  };

  const latencyColor = (ms: number) => {
    if (ms < 1000) return 'text-green-400';
    if (ms < 5000) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Ollama Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">
            All Ollama API requests proxied through BFF with kill switch state tracking
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Filter by model..."
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none w-48"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Total Requests</p>
          <p className="text-2xl font-bold text-gray-200">{entries.length}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Success Rate</p>
          <p className="text-2xl font-bold text-green-400">
            {entries.length > 0
              ? Math.round((entries.filter((e) => e.status_code >= 200 && e.status_code < 300).length / entries.length) * 100)
              : 0}%
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Avg Latency</p>
          <p className="text-2xl font-bold text-yellow-400">
            {entries.length > 0
              ? Math.round(entries.reduce((sum, e) => sum + e.latency_ms, 0) / entries.length)
              : 0}ms
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Blocked</p>
          <p className="text-2xl font-bold text-red-400">
            {entries.filter((e) => e.status_code === 503).length}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {modelFilter ? 'No entries matching filter' : 'No Ollama requests logged yet'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-800 rounded-lg">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tokens</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">KS State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200 font-mono">{entry.model}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">{entry.endpoint}</td>
                  <td className={`px-4 py-3 text-sm font-bold ${statusColor(entry.status_code)}`}>
                    {entry.status_code}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono ${latencyColor(entry.latency_ms)}`}>
                    {entry.latency_ms}ms
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {entry.prompt_tokens || '—'}/{entry.completion_tokens || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      entry.kill_switch_state === 'ARMED' ? 'bg-green-900/50 text-green-400' :
                      entry.kill_switch_state === 'STOPPED' || entry.kill_switch_state === 'LOCKED' ? 'bg-red-900/50 text-red-400' :
                      'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {entry.kill_switch_state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{entry.client_ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}