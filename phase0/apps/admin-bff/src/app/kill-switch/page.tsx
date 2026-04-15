'use client';

// Kill Switch Dashboard — Next.js BFF version

import { useAuth } from '@/components/auth/AuthProvider';
import { StatusIndicator } from '@/components/kill-switch/StatusIndicator';
import { EmergencyStopButton } from '@/components/kill-switch/EmergencyStopButton';
import { ActivationHistory } from '@/components/kill-switch/ActivationHistory';
import { useKillSwitchPolling } from '@/hooks/use-kill-switch';
import type { KillSwitchState } from '@/components/kill-switch/types';

const STATE_DESCRIPTIONS: Record<KillSwitchState, string> = {
  ARMED: 'System is armed and ready. No active experiments.',
  RUNNING: 'Chaos experiments are actively running.',
  STOPPING: 'Kill switch triggered. Experiments are terminating...',
  STOPPED: 'All chaos halted. Manual reset required.',
  LOCKED: 'Chaos disabled for maintenance or incident response.',
};

const STATE_BG: Record<KillSwitchState, string> = {
  ARMED: 'border-green-500/30 bg-green-500/5',
  RUNNING: 'border-yellow-500/30 bg-yellow-500/5',
  STOPPING: 'border-orange-500/30 bg-orange-500/5',
  STOPPED: 'border-red-500/30 bg-red-500/5',
  LOCKED: 'border-red-500/30 bg-red-500/5',
};

const STATE_TEXT: Record<KillSwitchState, string> = {
  ARMED: '#22c55e',
  RUNNING: '#eab308',
  STOPPING: '#f97316',
  STOPPED: '#ef4444',
  LOCKED: '#ef4444',
};

export default function KillSwitchPage() {
  const { user } = useAuth();
  const { status, loading, error, refetch } = useKillSwitchPolling(5000);

  const state = status?.state ?? 'ARMED';
  const userRole = user?.role ?? 'viewer';

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Loading kill switch status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Kill Switch Control</h1>
          <p className="text-sm text-gray-500 mt-1">
            Emergency stop for all chaos experiments (ADR-111 BCP)
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Connection lost
            <button onClick={refetch} className="ml-2 underline hover:text-red-300">Retry</button>
          </div>
        )}
      </div>

      {/* Main Status Card */}
      <div className={`rounded-xl border-2 p-6 ${STATE_BG[state]} transition-colors duration-500`}>
        <div className="flex items-center gap-8">
          <StatusIndicator state={state} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-bold tracking-wider" style={{ color: STATE_TEXT[state] }}>
                {state}
              </h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">{STATE_DESCRIPTIONS[state]}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase mb-1">Active Experiments</p>
                <p className="text-xl font-bold text-gray-200">{status?.activeExperiments ?? 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase mb-1">Last Activation</p>
                <p className="text-sm font-medium text-gray-300">
                  {status?.lastActivation ? new Date(status.lastActivation).toLocaleString() : 'Never'}
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase mb-1">Activated By</p>
                <p className="text-sm font-medium text-gray-300">{status?.lastActivationBy ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-800 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {userRole === 'admin' || userRole === 'sre'
              ? 'You have permission to activate the emergency kill switch'
              : 'Only SRE/Admin roles can activate the kill switch'}
          </div>
          <EmergencyStopButton currentState={state} userRole={userRole} />
        </div>
      </div>

      {/* Abort Conditions */}
      <div className="rounded-xl border border-gray-800 p-4 bg-gray-900">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Automatic Abort Conditions</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
            Error rate &gt;5% for 2 min → Soft abort
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
            Latency P99 &gt;2s for 3 min → Soft abort
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            Error rate &gt;10% for 1 min → Hard abort
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            Latency P99 &gt;5s for 1 min → Hard abort
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            Kill Switch API timeout &gt;30s → Fail-safe stop
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            Feature Flag Service down &gt;30s → Fail-safe stop
          </div>
        </div>
      </div>

      {/* Activation History */}
      <ActivationHistory />
    </div>
  );
}